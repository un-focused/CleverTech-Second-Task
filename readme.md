# JavaScript: Parallel Asynchronous Programming

## Objective
Your goal is to write an asynchronous function `pooledDownload`. This function needs to be able to parallelly download and save files from a given array of URLs, using a connection pool of a given size.

<br/>

## Dependencies
This function has two dependencies:
* a `connect` function that opens a connection the server
* a `save` function that will save the contents of any downloaded file

These two __dependencies are injected as parameters to your function__.

<br/>

## Parameters
Your `pooledDownload` function will be called with 4 parameters:
* An asynchronous function `connect()` that will return a `connection` instance
* An asynchronous function `save(fileContents)` that will save the result of a download
* An array of strings `downloadList`, that contains all the URLs from which a file needs to be downloaded
* A `maxConcurrency`, that denotes how large the connection pool should be

<br/>

## `connection` object <small>_(returned from  `connect()`)_</small>

An object containing two functions:
* An async function `download(url)`: Downloads a file from a given String `url`. Returns an object `fileContents` representing the file contents.
* A function `close()` closing the connection permanently

<br/>

## Acceptance criteria
* All files need to be downloaded and saved.
* File contents should be saved as soon as they are downloaded.
* Downloads must be distributed over the connections as evenly as possible.
* One connection can only be downloading one file at a time. You'll need to create more connections to download multiple files at the same time.
* Any opened connections must always be closed.
* If no connections could be opened to the server, your function needs to reject with a new `Error` containing the message `"connection failed"`.
* If any error occurred during the transfer, your function needs to reject with this same error.
* BONUS: Sometimes, the server may not have enough slots to accept the requested amount of concurrent connections. In this case, you are to stop opening new connections once the server reaches its capacity and proceed with as many connections as the server allows.
* You can choose whether to use `Promise`s, `async`/`await` or a mixture of them

<br/>

## Grading
Your solution will be graded on the basis of two measurements:
* 90%: Automated unit tests in `index.test.js`
* 10%: Automatic code quality analysis (detects common flaws like any unused variables)<br/>

## Read only files
You should only have to edit the file `index.js`. You can't edit any other existing files (including `package.json` and `index.test.js`) or your solution might not be accepted.