// connection opens a connection to a server
// save saves the contents of a file
// save(fileContents)
// array of strings download List contains all urls of files
// maxConcurrency, how large a pool is to be


function sleep(ms) {
  return new Promise(
      (resolve) => {
        setTimeout(
            () => resolve(),
            ms
        )
      }
  )
}
/*
1. calculate pool size
2. open connections for each file
3. when file download finishes or crashes close it & remove from queue
4. start next download
5. return
 */

const pooledDownload = async (connect, save, downloadList, maxConcurrency) => {
  // open as many connections as max concurrency or download list length
  const poolSize = Math.min(downloadList.length, maxConcurrency);
  const toBeDownloadedQueue = downloadList.slice();
  const cache = {};
  let totalConnections = 0;

  if (totalConnections >= maxConcurrency) {
    throw new Error('connection failed');
  }

  async function downloadFile(connect, save, url, connections) {
    const connection = await connect();
    // open a connection
    const { download, close } = connection;

    try {
      const result = await download(url);
      await save(result);

      // close is synchronous
      close();
    } catch(error) {
      close();
      throw error;
    }
  }

  // console.log('toBeDownloadedQueue.length', toBeDownloadedQueue.length);
  // console.log('counter', totalConnections, 'poolSize', poolSize);
  while (toBeDownloadedQueue.length !== 0) {
    // console.log('toBeDownloadedQueue.length', toBeDownloadedQueue.length);

    // console.log('counter', totalConnections, 'poolSize', poolSize);
    // console.log('totalConnections < poolSize', totalConnections < poolSize);

    // open x connections
    if (totalConnections < poolSize) {
      // get url from the queue
      const url = toBeDownloadedQueue.pop();

      console.log('downloading url', url);
      ++totalConnections;

      await downloadFile(connect, save, url);

      --totalConnections;
    }
  }
};

// void pooledDownload()

module.exports = pooledDownload