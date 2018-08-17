import { Router } from 'express';

const router = Router();

// Set up TSI route
router.get('/:environment/events', (req, res, next) => {
    res.status(200).end();
    next();
});

export const tsiRoute = router;