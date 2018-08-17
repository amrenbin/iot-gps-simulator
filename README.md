# GPS Simulator
This application can simulate a GPS-enabled device and sending location telemetry from specified starting position to end.

## Usage
Go to `src\config.ts` and configure the simulator:
``` JavaScript
simulator: {
    'car1': {
        depart: SEATTLE,
        arrive: NEWYORK,
        mph: 150, 
        ttl: 5, // seconds
        connectionString: '<Connection_String>'
    }
}
```
Go to `src\simulator\start.ts`, and configure the telemetry measurement/twin property name:
```JavaScript
const notifierOptions: Types.NotifierOptions = {
    deviceConnectionString: info.connectionString,
    measure: 'location' 
    twinProperty: 'device'
};
```

Go to `src\simulator\mapServiceClient.ts`, and set your Azure Map account key:
```JavaScript
const SUBSCRIPTION_KEY = '<Map_Key>';
```

Run below commands to start the simulator:
```sh
npm install
npm run debug
```
