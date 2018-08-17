import MapServiceClient from '../simulator/mapServiceClient';

const SEATTLE: Types.Coordinate = { lon: -122.3295, lat: 47.60357, name: 'Seattle' };
const BELLEVUE: Types.Coordinate = { lon: -122.1879, lat: 47.61002, name: 'Bellevue' };
const NEWYORK: Types.Coordinate = { lon: -75.6107, lat: 42.93708, name: 'NewYork' };

const depart: Types.Coordinate = SEATTLE;
const arrive: Types.Coordinate = BELLEVUE;
const mph = 100;
const mapService = MapServiceClient.GetInstance();
const wayPoints: Array<{lon: number, lat: number, miles: number}> = [];

mapService.getRoute(depart, arrive)
    .then(route => {
        console.log(`Total miles ${route.miles}, way points count ${route.wayPoints.length}`);
        iterateWayPoints(route.wayPoints)
            .then(() => {
                console.log(JSON.stringify(wayPoints));
                process.exit(0);
            });
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });

async function iterateWayPoints(wayPoints: Types.Coordinate[], index?: number): Promise<void> {
    index = index || 0;
    console.debug(`iterate: ${index}`);
    if (index >= wayPoints.length) {
        return Promise.resolve();
    }

    if (index === 0) {
        wayPoints.push(Object.assign({ miles: 0 }, wayPoints[index]))
        await iterateWayPoints(wayPoints, ++index);
    } else {
        const delta = await mapService.getRoute(wayPoints[0], wayPoints[index]);
        wayPoints.push(Object.assign({ miles: delta.miles }, wayPoints[index]));
        await iterateWayPoints(wayPoints, ++index);
    }

    return Promise.resolve();
}


