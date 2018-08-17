import * as http from 'http';
import * as WebSocket from 'ws';
import * as shortid from 'shortid';
import * as pathToRegExp from 'path-to-regexp';
import { AuthenticationContext, TokenResponse, ErrorResponse }  from 'adal-node';
import { promisify } from 'util';
import * as sourceMapSupport from 'source-map-support';

import app from './app';

sourceMapSupport.install();

const httpServer = http.createServer(app);
httpServer.listen(8081);

//
// WebSocketServer
const wssServer = new WebSocket.Server({ server: httpServer });
wssServer.on('connection', (socket, req) => {
    const tsiPath = '/api/tsi/environments/:environment/event';
    const keys: pathToRegExp.Key[] = [];
    const tsiRegex = pathToRegExp(tsiPath, keys);
    if (tsiRegex.test(req.url)) {
        const params: any = {};
        tsiRegex.exec(req.url).slice(1).forEach((param, i) => {
            params[keys[i].name] = param;
        });
        
        try {
            const tsiSocketUrl = `wss://${params.environment}.env.timeseries.azure.com/events?api-version=2016-12-12`;
            const tsiSocket = new WebSocket(tsiSocketUrl);
            tsiSocket.on('message', data =>  {
                socket.send(data);
            });

            tsiSocket.on('close', event => {
                tsiSocket.close();
            });

            socket.on('message', async (content) => {
                const token = await acquireToken(AadTsiResource, AadClientId, AadClientSecret);
                const data = {
                    headers: {
                        Authorization: 'Bearer ' + token,
                        'x-ms-client-request-id': shortid.generate()
                    },
                    content
                };
                tsiSocket.send(JSON.stringify(data));
            });

            socket.on('close', (number, reason) => {
                tsiSocket.close();
            });
        } catch (e) {
            socket.close();
            throw e;
        }
    } else {
        socket.close();
    }
    
});

const AadAuthority = 'https://login.windows.net';
const AadTenant = 'microsoft.onmicrosoft.com';
const AadAuthorityUrl = `${AadAuthority}/${AadTenant}`;
const authenticationContext = new AuthenticationContext(AadAuthorityUrl);
const AadTsiResource = 'https://api.timeseries.azure.com/';
const AadClientId = '<Client_ID>';
const AadClientSecret = '<Client_Secret>';

async function acquireToken(resource: string, clientId: string, clientSecret: string): Promise<string> {
    const res: TokenResponse = await promisify(authenticationContext.acquireTokenWithClientCredentials).bind(authenticationContext)(
        resource,
        clientId,
        clientSecret);

    if (res.error) {
        return Promise.reject(res.error);
    } else {
        return Promise.resolve(res.accessToken);
    }
}