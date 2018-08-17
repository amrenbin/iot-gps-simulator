import { MessageEnqueued, Connected } from 'azure-iot-common/lib/results';
import { Mqtt as Protocol } from 'azure-iot-device-mqtt';
import { Client, Message } from 'azure-iot-device';
import { promisify } from 'util';
import * as debug from 'debug';
import * as readline from 'readline-sync';

const Logger = debug('gps-simulator:manualEmitter');

const connString = readline.question('Type device connection string\n');
const client = Client.fromConnectionString(connString, Protocol);
client.open((err, result) => {
    if (err) {
        return Logger(`Client error: ${JSON.stringify(err)}.`);
    }
    Logger('Client connected at: %s ', connString);
    client.on('error', err => {
        Logger(`Client error: ${JSON.stringify(err)}.`);
    });

    client.on('disconnect', () => {
        Logger(`Client disconnected.`);
    });

    client.getTwin((err, twin) => {
        if (err) {
            return Logger('Twin error %o', err);
        }
        updateTwin(twin);
    });
});

process.on('beforeExit', () => {
    client.close((err, result) => {
        if (!err) {
            Logger('Client closed!');
        }
    })
});

function updateTwin(twin) {
    const userInput = readline.question('What message to send?\n');
    let twinPatch;
    try {
        twinPatch = JSON.parse(userInput)
    } catch (e) {
        Logger('Invalid input!\n');
    }

    if (twinPatch) {
        twin.properties.reported.update(twinPatch, err => {
            if (err) {
                Logger('Twin error: %O', err);
            }
    
            setImmediate(() => updateTwin(twin));
        });
    }
}