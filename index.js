// NOTES:
// connection opens a connection to a server
// save saves the contents of a file
// save(fileContents)
// array of strings download List contains all urls of files
// maxConcurrency, how large a pool is to be
/* 1. calculate pool size
2. open connections for each file
3. when file download finishes or crashes close it & remove from queue
4. start next download
5. return */

/**
 * generates an ID (psuedorandom)
 * @returns {string} the generated ID
 */
function generateID() {
    return `${ Math.random() }`;
}

/*
file comes in, pool downloads file, next file
*/
/**
 * parallelly downloads files using a pool of a given size (max allowed connections to server)
 * @param connect function that opens up a connection
 * @param save saves the contents of a file to disk
 * @param downloadList list (array) of strings that are urls (resource locators to files)
 * @param maxConcurrency max number of allowed connections (pool size)
 * @returns {Promise<void>} nothing is returned as it saves the files to disk, we can return
 * or some number that denotes the successful execution of the function
 */
const pooledDownload = async (connect, save, downloadList, maxConcurrency) => {
    // pool that contains the connections
    const pool = [];
    // theoretical max size of the pool, we can have less connections if we
    // are downloading an amount of files that is lower that the desired pool size
    // & this would be ideal as it would save time & resources on opening unnecessary
    // connections
    const poolSize = Math.min(downloadList.length, maxConcurrency);
    // copy the queue (shallow copy) as we will delete items from it as we execute
    // on them the queue is a first in last out as we are popping from the end
    const toBeDownloadedQueue = downloadList.slice();

    /**
     * inner function to save a file (scope is inside the
     * function as it is generally only useful in this local context)
     * downloads a file from a url then saves it using a connection
     * @param connection used to get the file (contains the download function)
     * @param save function used to save the file to disk
     * @param url location of where the file is located
     * @returns {Promise<*>} the return of the save function (determined by the caller)
     */
    async function saveFile(connection, save, url) {
        // get download function from connection
        const { download } = connection;

        // contents of the downloaded file
        const contents = await download(url);

        // save the file
        return save(contents);
    }

    /**
     * inner function to save a file (scope is inside the
     * function as it is generally only useful in this local context)
     * opens a connection & adds the connection to the pool
     * @param pool an array in which to store the connection
     * @param connect function that opens a connection
     * @returns {Promise<void>} nothing is returned but we could return an
     * indicator of a successful execution
     */
    async function addConnectionToPool(pool, connect) {
        // generate an id for the connection
        const id = generateID();

        // open a connection
        const connection = await connect();

        // set the id to the connection
        connection.id = id;

        // push the connection to the pool
        pool.push(connection);
    }

    // wait for the connections to be created (of size poolSize)
    for (let i = 0; i < poolSize; ++i) {
        try {
            // add connection to pool
            await addConnectionToPool(pool, connect);
        } catch(error) {
            const { message } = error;
            // if we have a connection, then let's proceed with how many we have (bonus part)
            if (i === 0 && message === 'server already at capacity') {
                throw new Error('connection failed');
            }

            // if we run into an error making a connection, stop making new connections
            break;
        }
    }

    /**
     * inner function to save a file (scope is inside the
     * function as it is generally only useful in this local context)
     * similar idea to runnables in java & in other languages
     * this function is what will execute on each open connection
     * takes a url from the queue, downloads & saves the file
     * & then recursively calls itself to do it again until
     * the queue is empty (allowing us to reuse the connection)
     * @param connection used to retrieve the file
     * @param save used to save the file (function passed in by caller)
     * @param queue used to take urls that need to be downloaded off on
     * @returns {any} returns true when queue is empty otherwise
     * calls itself recursively until an error occurs or true is returned
     */
    function execute(connection, save, queue) {
        // if queue is empty, return true, nothing to do
        if (queue.length === 0) {
            return true;
        }

        // pop url from queue (data)
        const url = queue.pop();

        // save file using connection, save function & the url
        return saveFile(connection, save, url)
            .then(
                // recursively call itself to get more items off queue
                () => execute(connection, save, queue)
            ).catch(
                (error) => {
                    // re-add url to queue at the end to try again later
                    queue.push(url);

                    // reject with error as there was a download error
                    return Promise.reject(error);
                }
            )
    }

    // promises array that is used for promise.all
    let promises = [];
    // run execute on the connections in the pool
    for (const connection of pool) {
        // add the execute function promises to the promises array
        promises.push(execute(connection, save, toBeDownloadedQueue));
    }

    try {
        // wait for the execution to finish for all connections
        await Promise.all(promises);
    } catch(error) {
        // remove any connections from the pool as you close them
        // to not close a connection twice or do any extra work
        // additionally, this reduces the memory by remove items from the array
        while (pool.length !== 0) {
            // destructure the close function from the last item of the array
            const { close } = pool.pop();

            // call the close function to close the connection
            close();
        }

        // throw the error that we caught as we have done the cleanup
        throw error;
    }

    // remove any connections from the pool as you close them
    // to not close a connection twice or do any extra work
    // additionally, this reduces the memory by remove items from the array
    while (pool.length !== 0) {
        // destructure the close function from the last item of the array
        const { close } = pool.pop();

        // call the close function to close the connection
        close();
    }
};

module.exports = pooledDownload;