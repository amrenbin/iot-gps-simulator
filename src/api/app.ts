import * as express from 'express';
import * as passport from 'passport';
import { BearerStrategy } from 'passport-azure-ad';
import * as cors from 'cors';

import { tsiRoute } from './routes/index';

const authenticatedUserTokens = [];
const app = express();

app.use(cors());
app.use(passport.initialize());
passport.use(new BearerStrategy({
    identityMetadata: 'https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/.well-known/openid-configuration',
    clientID: '<Client_ID>',
}, (token, done) => {
    let currentUser = null;
    let userToken = authenticatedUserTokens.find((user) => {
        currentUser = user;
        return user.sub === token.sub;
    });

    if(!userToken) {
        authenticatedUserTokens.push(token);
    }

    return done(null, currentUser, token);
} 
));

app.use(passport.authenticate('oauth-bearer', { session: false }));
app.get('/ping', (req, res) => {
    res.status(200).end();
});

// Route registration
app.use('/api/tsi', tsiRoute);

export default app;