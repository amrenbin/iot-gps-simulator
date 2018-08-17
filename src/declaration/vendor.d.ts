/// <reference path="../../node_modules/azure-event-hubs/lib/index.d.ts" />

declare namespace MapApi {

    type DataFormat = 'json' | 'xml';

    type TravelMode = 'bus' | 'bicycle' | 'car' | 'motorcycle' | 'pedestrian' | 'truck' | 'taxi' | 'van';

    type RouteType = 'eco' | 'fastest' | 'shortest' | 'thrilling';

    interface GetRouteParams {
        'api-version': '1.0';
        'subscription-key': string;
        traffic?: boolean;
        travelMode?: TravelMode;
        query: string;
    }

    interface GetRouteResponse {
        routes: {
            summary: {
                lengthInMeters: number;
            },
            legs: {
                points: { longitude: number; latitude: number; }[]
            }[];
        }[];
    }    
}