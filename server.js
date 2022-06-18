require('dotenv').config();
const fs = require('fs');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { TikTokConnectionWrapper, getGlobalConnectionCount } = require('./connectionWrapper');
const ConsumerQueue = require('consumer-queue');
const queue = new ConsumerQueue();
const app = express();
const httpServer = createServer(app);

// Enable cross origin resource sharing
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});

const storage = []

io.on('connection', (socket) => {
    let tiktokConnectionWrapper;

    function enqueue(type, msg) {
        const value = { type, msg };
        // console.log('enqueue', type, msg);
        // console.log(JSON.stringify(value));
        storage.push(value);
        queue.push(value);
    }

    function loop() {
        return queue.pop().then((value) => {
            // console.log('dequeue', value)
            const { type, msg } = value;
            socket.emit(type, msg)
            // setInterval(() => {
            //     return loop();
            // }, 1000);
            return loop();
        }).catch((error)=>{
            console.log('stop listen')
        });
    }

    function stopLoop(){
        console.log('stopLoop')
        queue.cancelWait();
        // console.log(JSON.stringify(storage));
        // fs.writeFile('test.json', JSON.stringify(storage), err => {
        //     if (err) {
        //         console.error(err);
        //     }
        //     // file written successfully
        // });
    }

    socket.on('setUniqueId', (uniqueId, options) => {

        // Prohibit the client from specifying these options (for security reasons)
        if (typeof options === 'object') {
            delete options.requestOptions;
            delete options.websocketOptions;
        }

        // Is the client already connected to a stream? => Disconnect
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }

        // Connect to the given username (uniqueId)
        try {
            tiktokConnectionWrapper = new TikTokConnectionWrapper(uniqueId, options, true);
            tiktokConnectionWrapper.connect();
        } catch(err) {
            socket.emit('disconnected', err.toString());
            return;
        }

        // Redirect wrapper control events once
        tiktokConnectionWrapper.once('connected', state => {
            console.log('startLoop')
            loop();
            socket.emit('tiktokConnected', state)}
        );
        tiktokConnectionWrapper.once('disconnected', reason => {
            socket.emit('tiktokDisconnected', reason)
        });

        // Notify client when stream ends
        tiktokConnectionWrapper.connection.on('streamEnd', () => socket.emit('streamEnd'));

        // Redirect message events
        tiktokConnectionWrapper.connection.on('roomUser', msg => enqueue('roomUser', msg));
        // tiktokConnectionWrapper.connection.on('member', msg => enqueue('member', msg));
        tiktokConnectionWrapper.connection.on('chat', msg => enqueue('chat', msg));
        tiktokConnectionWrapper.connection.on('gift', msg => enqueue('gift', msg));
        tiktokConnectionWrapper.connection.on('social', msg => enqueue('social', msg));
        tiktokConnectionWrapper.connection.on('like', msg => enqueue('like', msg));
        tiktokConnectionWrapper.connection.on('questionNew', msg => enqueue('questionNew', msg));
        tiktokConnectionWrapper.connection.on('linkMicBattle', msg => enqueue('linkMicBattle', msg));
        tiktokConnectionWrapper.connection.on('linkMicArmies', msg => enqueue('linkMicArmies', msg));
        tiktokConnectionWrapper.connection.on('liveIntro', msg => enqueue('liveIntro', msg));
    });

    socket.on('disconnect', () => {
        stopLoop();
        // console.log(JSON.stringify(storage));
        if(tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }
    });
});

// Emit global connection statistics
setInterval(() => {
    io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
}, 5000)

// Serve frontend files
app.use(express.static('public'));

// Start http listener
const port = process.env.PORT || 8081;
httpServer.listen(port);
console.info(`Server running! Please visit http://localhost:${port}`);
