import { MessageEnqueued, Connected } from 'azure-iot-common/lib/results';
import { Mqtt as Protocol } from 'azure-iot-device-mqtt';
import { Client, Message } from 'azure-iot-device';
import { promisify } from 'util';
import * as debug from 'debug';

const Logger = debug('gps-simulator:IoTHubNotifier');

class IoTHubNotifier implements Types.INotifier {

    private _client: Client;

    private _isConnected: boolean = false;

    constructor(private options: Types.NotifierOptions) {
        this._client = Client.fromConnectionString(this.options.deviceConnectionString, Protocol);
    }

    public async open(): Promise<void> {
        await promisify(this._client.open).bind(this._client)();
        this._isConnected = true;
        Logger('client connected at: %s ', this.options.deviceConnectionString);
        this._client.on('message', msg => {
            Logger(`message received: ${JSON.stringify(msg)}`);
            this._client.complete(msg, (err) => {
                if (err) {
                    Logger(`error in completing message ${JSON.stringify(err)}`);
                }
            });
        });

        this._client.on('error', err => {
            Logger(`client error: ${JSON.stringify(err)}.`);
        });

        this._client.on('disconnect', () => {
            this._isConnected = false;
            Logger(`client disconnected.`);
        });
    }

    public async close(): Promise<void> {
        this._client.removeAllListeners();
        await promisify(this._client.close)();
        this._isConnected = false;
    }

    public async send(position: Types.Coordinate): Promise<void> {
        if (!this._isConnected) {
            throw new Error('client has disconnected');
        }
        if (!position) {
            return;
        }

        if (this.options.measure) { // Measure route
            // const noiseData = {
            //     speed: 100,
            //     temperature: 46,
            //     humidity: 23
            // };
            const noiseData = {};
            const message = new Message(JSON.stringify(Object.assign({
                [this.options.measure]: position
            }, noiseData)));
            Logger('Event payload: %O', message.data);
            await promisify(this._client.sendEvent).bind(this._client)(message);
        }


        // Update twin data for latest property
        if (this.options.twinProperty) {   
            this._client.getTwin((err, twin) => {
                if (err) {
                    return console.error(err);
                }
            
                const patch = {
                    // [this.options.twinProperty]: JSON.stringify({
                    //     type: 'Feature',
                    //     geometry: {
                    //         type: 'Point',
                    //         coordinates: [position.lon, position.lat]
                    //     }
                    // })
                    [this.options.twinProperty]: {
                        lon: position.lon,
                        lat: position.lat
                    }
                };
                Logger('Twin.properties.reported: %O', patch);
                twin.properties.reported.update(patch, err => {
                    if (err) {
                        console.error(err);
                    }
                });
            });
        }
    }
}

export default IoTHubNotifier;