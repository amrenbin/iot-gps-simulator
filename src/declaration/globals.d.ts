declare namespace Types {
    
    interface Coordinate {
        lon: number;
        lat: number;
        alt?: number;
        name?: string;
    }

    interface IRouteProvider {
        getRoute(...wayPoints: Types.Coordinate[]): Promise<Route>;
    }
    
    type Route = {
        miles: number;
        wayPoints: Coordinate[];
    }

    interface INotifier {

        open(): Promise<void>;

        close(): Promise<void>;

        send(point: Coordinate): Promise<void>;
    }

    interface NotifierOptions {
        
        deviceConnectionString: string;

        measure?: string;

        twinProperty?: string;
    }

    type Config = {
        simulator: {
            [key: string]: {
                depart: Coordinate,
                arrive: Coordinate,
                mph: number,
                ttl: number,
                connectionString: string
            }
        },
        geoFencing: {
            eventHubConnectionString: string,
            eventHubName: string,
            consumerGroup: string
        }
    }
}