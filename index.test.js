const pooledDownload = require('.')

const contentByFilename = Object.fromEntries(
  Array(60)
    .fill()
    .map((e, i) => [`https://server.com/file/${i}`, { success: true, payload: 'example' }]),
)

const filenames = Object.keys(contentByFilename)
const contents = Object.values(contentByFilename)

const setup = ({ saveCallback = () => {}, downloadCallback = () => {}, closeCallback = () => {} } = {}) => {
  const connect = jest.fn(() => {
    return new Promise((r) =>
      setTimeout(() => {
        let downloading = false
        let closed = false

        r({
          download: jest.fn(
            (x) =>
              new Promise((resolve, reject) =>
                setTimeout(() => {
                  try {
                    downloadCallback(x)
                  } catch (e) {
                    reject(e)
                  }

                  if (closed) reject(Error('connection has been closed'))
                  if (downloading) reject(Error('connection in use by another download'))

                  downloading = true

                  if (closed) reject('connection closed while downloading')
                  downloading = false
                  resolve(contentByFilename[x])
                }, 10),
              ),
          ),
          close: jest.fn(() => {
            closeCallback()

            closed = true
          }),
        })
      }, 20),
    )
  })

  const save = jest.fn((x) => {
    saveCallback(x)
    new Promise((resolve) => setTimeout(() => resolve({ success: true }), 5))
  })

  return { connect, save }
}

const getReturnValues = (mockFn) =>
  mockFn.mock.results.filter((connection) => connection.type === 'return').map((connection) => connection.value)

const promiseAllResolved = async (promises) =>
  (await Promise.allSettled(promises)).filter((p) => p.status !== 'rejected').map((p) => p.value)

describe('pooledDownload post-run analysis:', () => {
  const maxConcurrency = 5

  let connections
  let connect
  let save

  beforeAll(async () => {
    ;({ connect, save } = setup())
    await pooledDownload(connect, save, filenames, maxConcurrency)
    connections = await Promise.all(getReturnValues(connect))
  })

  it('all files downloaded', async () => {
    const downloadFunctions = connections.map((c) => c.download)
    const downloadCalls = downloadFunctions.flatMap((f) => f.mock.calls)
    const downloadReturns = downloadFunctions.flatMap(getReturnValues)

    expect(downloadCalls).toHaveLength(filenames.length)
    filenames.forEach((filename) => expect(downloadCalls.some(([arg]) => arg === filename)))
    filenames.forEach((filename) => expect(downloadCalls.some(([arg]) => arg === filename)))
  })

  it('all files saved', async () => {
    expect(save.mock.calls.length).toBe(contents.length)
    contents.forEach((content) => expect(save.mock.calls.some(([arg]) => arg === content)))
  })

  it('all connections closed', async () => {
    const closeFunctions = connections.map((c) => c.close)
    closeFunctions.forEach((close) => expect(close).toHaveBeenCalledTimes(1))
  })

  it('opened the correct amount of connections', async () => {
    expect(connections).toHaveLength(maxConcurrency)
  })

  it('files were downloaded concurrently', async () => {
    connections.forEach((connection) => {
      const returnCount = getReturnValues(connection.download).length
      expect(returnCount).toBeGreaterThanOrEqual(filenames.length / maxConcurrency - maxConcurrency)
      expect(returnCount).toBeLessThanOrEqual(filenames.length / maxConcurrency + maxConcurrency)
    })
  })

  it('downloads were distributed evenly among connections', async () => {
    connections.forEach((connection) => {
      const returnCount = getReturnValues(connection.download).length
      expect(returnCount).toBeGreaterThanOrEqual(Math.floor(filenames.length / maxConcurrency))
      expect(returnCount).toBeLessThanOrEqual(Math.ceil(filenames.length / maxConcurrency))
    })
  })
})

describe('pooledDownload connection error handling:', () => {
  const maxConcurrency = 3

  let connect
  let save

  beforeEach(async () => {
    ;({ connect, save } = await setup())
    const connectImplementation = connect.getMockImplementation()
    connect.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(Error('server already at capacity')))),
    )
  })

  it('throws an error with message "connection failed" if no connection could be made', async () => {
    await expect(pooledDownload(connect, save, filenames, maxConcurrency)).rejects.toMatchObject({
      message: 'connection failed',
    })
  })
})

describe('pooledDownload download error handling:', () => {
  const maxConcurrency = 4
  const e = new Error('unexpected error during download')

  let connect

  beforeEach(async () => {
    let downloads = 0
    const downloadCallback = () => {
      downloads++
      if (downloads > filenames.length / 2) throw e
    }
    ;({ connect, save } = await setup({ downloadCallback }))
  })

  it('pooledDownload is rejected with the download error', async () => {
    await expect(pooledDownload(connect, save, filenames, maxConcurrency)).rejects.toBe(e)
  })

  it('closes all connections in case of a download error', async () => {
    await pooledDownload(connect, save, filenames, maxConcurrency).catch(() => {})
    const connections = await Promise.all(getReturnValues(connect))
    expect(connections).toHaveLength(maxConcurrency)
    connections.forEach((c) => expect(c.close).toHaveBeenCalledTimes(1))
  })
})

describe('pooledDownload connection limit handling:', () => {
  const maxConcurrency = 6

  let connections
  let connect
  let save

  const crashAfterConnections = maxConcurrency - 3

  beforeAll(async () => {
    ;({ connect, save } = await setup())

    const connectImplementation = connect.getMockImplementation()
    for (let i = 0; i < crashAfterConnections; i++) {
      connect.mockImplementationOnce(connectImplementation)
    }
    connect.mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('connection failed'))
          }, 20)
        }),
    )

    await pooledDownload(connect, save, filenames, maxConcurrency)
    connections = await promiseAllResolved(getReturnValues(connect))
  })

  it('uses as many connections as are available', async () => {
    expect(connections).toHaveLength(crashAfterConnections)
  })

  it('downloads were distributed evenly among the successful connections', async () => {
    connections.forEach((connection) => {
      const returnCount = getReturnValues(connection.download).length
      expect(returnCount).toBeGreaterThanOrEqual(Math.floor(filenames.length / crashAfterConnections))
      expect(returnCount).toBeLessThanOrEqual(Math.ceil(filenames.length / crashAfterConnections))
    })
  })

  it("doesn't unnecessarily connect again after it notices that the server is at capacity", async () => {
    const rejectVal = {}

    expect(connect).toHaveBeenCalledTimes(crashAfterConnections + 1)
  })
})

describe('pooledDownload real-time tests:', () => {
  const maxConcurrency = 6

  it('saves files immediately after finishing download', async () => {
    let saveCount = 0
    let downloadCount = 0

    const downloadCallback = () => {
      downloadCount++
    }
    const saveCallback = () => {
      saveCount++
      expect(downloadCount).toBeGreaterThanOrEqual(saveCount)
      expect(downloadCount).toBeLessThanOrEqual(saveCount + maxConcurrency - 1)
    }
    const { connect, save } = await setup({ downloadCallback, saveCallback })

    await pooledDownload(connect, save, filenames, maxConcurrency)
    expect(downloadCount).toBe(filenames.length)
    expect(saveCount).toBe(contents.length)
  })

  it('closes connections at the end', async (done) => {
    let saveCount = 0

    const closeCallback = () => {
      expect(saveCount).toBeGreaterThan(contents.length - maxConcurrency)
      done()
    }
    const saveCallback = () => {
      saveCount++
    }

    const { connect, save } = await setup({ saveCallback, closeCallback })
    await pooledDownload(connect, save, filenames, maxConcurrency)
  })
})
