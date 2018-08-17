import * as EventHub from 'azure-event-hubs';
import * as debug from 'debug';
import Config from '../config';

const Logger = debug('gps-simulator:geofencing');

const client: EventHub.Client = EventHub.Client.fromConnectionString(Config.geoFencing.eventHubConnectionString, Config.geoFencing.eventHubName);

client.open()
    .then(() => { return client.getPartitionIds(); })
    .then(partitionIds => {
        Logger(`Partitions: ${partitionIds.join(',')}.`);
        partitionIds.forEach(id => {
            console.log(`Create receiver on Partition ${id}, consumer group: ${Config.geoFencing.consumerGroup}`);
            client.createReceiver(Config.geoFencing.consumerGroup, id, { startAfterTime: Date.now() })
                .then(rx => {
                    rx.on('errorReceived', err => {
                        Logger(`Partition:${id} error: ${JSON.stringify(err)}`);
                    });
                    rx.on('message', (message: EventHub.Message) => {
                        // Logger(`Partition:${id}: ${message.enqueuedTimeUtc}- ${JSON.stringify(message.body)}`);
                        Logger('ASA triggered a fencing rule: %o', {
                            deviceId: message.body.__deviceid,
                            position: message.body.position
                        });
                    });
                });
        });
    })
    .catch(err => {
        Logger(err);
    });