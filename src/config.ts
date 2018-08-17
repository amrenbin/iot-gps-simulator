
const SEATTLE: Types.Coordinate = { lon: -122.3295, lat: 47.60357, name: 'Seattle' };
const BELLEVUE: Types.Coordinate = { lon: -122.1879, lat: 47.61002, name: 'Bellevue' };
const NEWYORK: Types.Coordinate = { lon: -75.6107, lat: 42.93708, name: 'NewYork' };

const Config: Types.Config = {
    simulator: {
        'car1': {
            depart: SEATTLE,
            arrive: NEWYORK,
            mph: 150, 
            ttl: 5, // seconds
            connectionString: '<Connection_String>'
        }
    },
    geoFencing: {
        eventHubConnectionString: '<Connection_String>',
        eventHubName: 'rules-event-hub',
        consumerGroup: '<group>'
    }
};

export default Config;