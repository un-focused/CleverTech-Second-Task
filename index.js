const pooledDownload = (connect, save, downloadList, maxConcurrency) => {
  return connect().then((connection) => {
    const { download, close } = connection
    return download(downloadList[0]).then((result) => save(result)) // download the first file and save the result
  })
}

module.exports = pooledDownload
