import CarSimulator from './carSimulator';
import IoTHubNotifier from './iotHubNotifier';
import MapServiceClient from './mapServiceClient';
import Config from '../config';
import * as debug from 'debug';

require('source-map-support').install();


Object.keys(Config.simulator).map(id => {
    const info = Config.simulator[id];
    const notifierOptions: Types.NotifierOptions = {
        deviceConnectionString: info.connectionString,
        measure: 'location'
        // twinProperty: 'device'
    };

    const car = new CarSimulator(id, MapServiceClient.GetInstance(), new IoTHubNotifier(notifierOptions));
    car.setup({ 
        wayPoints: [info.depart, info.arrive],
        mph: info.mph,
        ttl: info.ttl
    }).then(() => {
        car.go();
    });
});