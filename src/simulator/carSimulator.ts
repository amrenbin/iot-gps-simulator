import * as debug from 'debug';

type CarState = 'new' | 'ready' | 'running' | 'stop';

type CarOptions = {
    wayPoints: Types.Coordinate[],
    mph?: number;
    ttl?: number;
};

type RouteSummary = {
    miles: number; // miles
    duration: number; //
}

class CarSimulator {

    private _state: CarState;
    private _options: CarOptions;
    private _buckets: Types.Coordinate[] = [];
    private _currentRoute: number = 0;
    private _iteration: number = 0;
    private _uploadHandler: number;
    private _route: Types.Route;
    private _logger: debug.IDebugger;

    private DEFAULT_SPEED = 30; //mph
    private DEFAULT_TTL = 5; // seconds
    
    constructor(
        private id: string, 
        private routeProvider: Types.IRouteProvider,
        private iothubNotifier: Types.INotifier) {
        this._logger = debug(`gps-simulator:CarSimulator#${id}`);
        this._state = 'new';
    }

    public async setup(options: CarOptions): Promise<RouteSummary> {
        if (!(this._state === 'new' || this._state === 'stop')) {
            throw new Error(`Cannot perform setup() while car is in ${this._state} state`);
        }

        if (!options.wayPoints || options.wayPoints.length < 2) {
            throw new Error('At least 2 way points must be provided.');
        }

        this._options = options;
        this._options.mph = this._options.mph || this.DEFAULT_SPEED;
        this._options.ttl = this._options.ttl || this.DEFAULT_TTL;
        this._route = await this.routeProvider.getRoute(...this._options.wayPoints);
        this._currentRoute = 0;
        this._state = 'ready';
        this._logger(`Depart: %s, 
                      Arrive: %s, 
                      Distance: %d miles, 
                      Speed:%d/Mph,
                      TTL: %d sec.`,
                      this._route.wayPoints[0].name, 
                      this._route.wayPoints[this._route.wayPoints.length - 1].name,
                      this._route.miles,
                      this._options.mph,
                      this._options.ttl);
        // 
        // Open IoTHub notifier
        await this.iothubNotifier.open();
        return {
            miles: this._route.miles,
            duration: (this._route.miles / this._options.mph) * 60 * 60 // in seconds
        } as RouteSummary;
    }

    public go() {
        if (!(this._state === 'ready' || this._state === 'stop')) {
            throw new Error(`Car is not in ready|stop state`);
        }
        this._state = 'running';
        this._logger('Engine starts.');
        this.uploadLocation();
    }

    public stop() {
        if (this._state !== 'stop') {
            if (this._uploadHandler) {
                clearTimeout(this._uploadHandler);
            }
            this._logger('Engine stopped.');
            this._state = 'stop';
        }
    }

    private async uploadLocation(): Promise<void> {
        if (this._currentRoute >= this._route.wayPoints.length) {
            this.stop();
        } else {
            if (this._currentRoute === 0) {
                await this.iothubNotifier.send(this._route.wayPoints[0]); // Departure point
                this._currentRoute++;
                this._iteration++;
            } else {
                const timeElapsed = this._iteration * this._options.ttl;
                this._iteration++;
                const desiredMiles = (timeElapsed / 60 / 60) * this._options.mph;
                while (this._currentRoute < this._route.wayPoints.length) {    
                    let route: Types.Route;
                    try {
                        route = await this.routeProvider.getRoute(this._route.wayPoints[0], this._route.wayPoints[this._currentRoute]);
                    } catch (e) {
                        // If fails to query distance, move to next way point
                        this._logger('Error in querying distance between way points %o', e.message);
                    }

                    const nextMiles = route && route.miles;                    
                    if (nextMiles && nextMiles >= desiredMiles) {
                        this._logger(`Distanced traveled: ${nextMiles}miles.`);
                        try {
                            await this.iothubNotifier.send(this._route.wayPoints[this._currentRoute]);
                        } catch (e) {
                            this._logger('Error in sending location data %s', e.message);
                        }

                        break;
                    } else {
                        this._currentRoute++;
                    }
                }
            }

            if (this._currentRoute < this._route.wayPoints.length) {
                this._uploadHandler = setTimeout(this.uploadLocation.bind(this), this._options.ttl * 1000);
            } else {
                this._uploadHandler = null;
            }
        }
    }
}

export default CarSimulator;