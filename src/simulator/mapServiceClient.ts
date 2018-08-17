import * as request from 'request-promise';
import * as debug from 'debug';


const SUBSCRIPTION_KEY = '<Map_Key>';
const ROOT_URI = 'https://atlas.microsoft.com';
const METER_TO_MILE: number = 0.00062137;

class MapServiceClient implements Types.IRouteProvider {

    private constructor() {
        this._logger = debug('gps-simulator:MapServiceClient');
    }

    private static _singleton: MapServiceClient;

    private _logger: debug.IDebugger;

    public static GetInstance() {
        if (!this._singleton) {
            this._singleton = new MapServiceClient();
        }
        return this._singleton;
    }

    /* 
    * Calculates routes based on given way points.
    * */
    public async getRoute(...wayPoints: Types.Coordinate[]): Promise<Types.Route> {
        const url = `${ROOT_URI}/route/directions/json`;
        const query = wayPoints.map(o => `${o.lat},${o.lon}`).join(':'); // Sample: 52.50931,13.42936:52.50274,13.43872
        const qs: MapApi.GetRouteParams = {
            'api-version': '1.0',
            'subscription-key': SUBSCRIPTION_KEY,
            traffic: false,
            travelMode: 'car',
            query
        };
        
        const res: MapApi.GetRouteResponse = await request.get({
                url,
                qs,
                json: true,
            });

        if (!res || !res.routes || res.routes.length < 1) {
            return null;
        }
    
        let points: Types.Coordinate[] = [];
        res.routes[0].legs.forEach(leg => points = points.concat(
                leg.points.map(point => Object.assign({}, { lon: point.longitude, lat: point.latitude }))));

        points[0].name = wayPoints[0].name;
        points[points.length - 1].name = wayPoints[wayPoints.length - 1].name;
        return {
            miles: res.routes[0].summary.lengthInMeters * METER_TO_MILE,
            wayPoints: points
        };
    }
}

export default MapServiceClient;