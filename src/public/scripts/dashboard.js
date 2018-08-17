(function() {

    /*
     * Type Declartions:
     * 
     * type Point = { center: {lon: number, lat: number, _coordinate?: number[]}, radius: number}
     * 
     * */

    const OFFSET_TIMEFRAME = 10; // seconds
    const AZUREMAP_REST_API = 'https://atlas.microsoft.com';
    const METER_TO_MILE = 0.00062137;
    const MILE_TO_METER = 1609.344;
    const INTERVAL = 5; // seconds

    const CONTROL_ID = {
        fenceMode: '#fenceMode',
        appId: '#appId',
        deviceId: '#deviceId',
        measure: '#measure',
        searchForm: '#search'
    };

    const MAP_CONFIG = {
        key: '<Map_Key>',
        container: 'map',
        defaultZoom: 12,
        layers: {
            route: {
                name: '_route',
                cap: 'round',
                join: 'round'
            },
            pin: {
                name: '_pin',
                style: {
                    default: 'pin-red' //"pin-darkblue" | "pin-blue" | "pin-red" | "pin-round-darkblue" | "pin-round-blue" | "pin-round-red" | "none" = "pin-darkblue"
                }
            },
            fencingBuild: { // Layer to display current fencing line-string on mouse move event
                name: '_fencing-build',
                cap: 'round',
                join: 'round'
            },
            fencingStage: { // Layer to display in-complete fencing shape
                name: '_fencing-stage',
                cap: 'round',
                join: 'round'
            },
            fencing: { // Layer to display the completed fencing shape
                name: '_fencing',
            }
        },
        styles: {
            overlayColor: 'rgba(128,255,255,.5)',
            overlayOutlineWidth: 3,
            overlayOutlineColor: '#0fffff',
            lineStringColor: '#0080ff',
            lineStringWidth: 3,
            routeLineColor: '#ff0000',
            routeLineWidth: 3
        }
    };
    
    var _mapControl;
    var _mapPopups = [];
    var _enqueuedRefreshTimer;
    // Point[] _polygon
    var _polygon = [];        
    // { center: Point, radius?: { pixel: number, meters: number }}
    var _radius = {};
    var _mapMode = 'read'; // 'mark', 
    var _fenceMode = 'radius'; // 'radius' | 'polygon'
    // {lon: number, lat: number}[] 
    var _deviceRoutes = [];

    $(document).ready(function() {
        initializeMap();
        setTestHook();
        $(CONTROL_ID.searchForm).on('submit', () => {
            event.preventDefault();
            const [appId, deviceId, measure] = [$(CONTROL_ID.appId).val(), $(CONTROL_ID.deviceId).val(), $(CONTROL_ID.measure).val()];
            if (!deviceId || !measure || !appId) { return; }
            _deviceRoutes = [];
            if (_enqueuedRefreshTimer) {
                clearTimeout(_enqueuedRefreshTimer);
            }
            initializeMapLayers( 
                MAP_CONFIG.layers.pin.name,
                MAP_CONFIG.layers.route.name
            );
            refreshDeviceRoute(appId, deviceId, measure);
        });

        $(CONTROL_ID.fenceMode).val(_fenceMode);
        $(CONTROL_ID.fenceMode).change(function (event) { 
            _mapMode = 'read';
            const newMode = $('#fenceMode').val();
            if (newMode.length > 0 && _fenceMode !== newMode) {
                console.debug('Switch to ' + newMode + ' mode');
                _fenceMode = newMode;
                initializeMap();
            }
        });
    });

    /** 
     * Initializes the map control
     * */
    function initializeMap() {
        if (!_mapControl) { 
            _mapControl = new atlas.Map(MAP_CONFIG.container, {
                'subscription-key': MAP_CONFIG.key,
                zoom: MAP_CONFIG.defaultZoom
            });

            // Set current location as center
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function (position) {
                    _mapControl.setCamera({ 
                        center: [position.coords.longitude, position.coords.latitude], 
                        duration: 1000,
                        type: 'fly'
                    });
                });
            }

            initializeMapLayers( // Route and PIN layers only need to initialize once on start.
                MAP_CONFIG.layers.route.name,
                MAP_CONFIG.layers.pin.name
            );

            // Enter or continue geo fencing edit
            _mapControl.addEventListener('click', 
                /* 
                * @param {positions: number[], type: string} event
                * */
                function (event) {
                    if (_mapMode === 'read') {
                        // If map is in 'read' mode, will start new polygon draw flow, clean up both the points and fence layers if any.
                        _polygon = [];
                        _radius = {};
                        initializeMapLayers(MAP_CONFIG.layers.fencingBuild.name, MAP_CONFIG.layers.fencingStage.name, MAP_CONFIG.layers.fencing.name);
                        _mapMode = 'mark';
                    }

                    switch (_fenceMode) {
                        case 'polygon':
                            // Polygon requires at minimum 4 points with point[0] == point[last], 
                            // and calculate distance from first point then snap to it if close enough
                            const offset = _polygon.length > 3 ? Math.sqrt(Math.pow(Math.abs(_polygon[0].lon - event.position[0]), 2) + Math.pow(Math.abs(_polygon[0].lat - event.position[1]), 2)) : undefined;
                            console.debug('coordinates:' + event.coordinate, ', position:' + event.position, ', offset: ' + offset + ', event: '+ JSON.stringify(event));                    
                            if (!offset || offset > 0.003) { // TODO: Some magic number, related to zoom level
                                _polygon.push({ lon: event.position[0], lat: event.position[1], _coordinate: event.coordinate });                        
                                if (_polygon.length > 1) { // 2+ points for a line
                                    _layerAddWrapper(
                                        MAP_CONFIG.layers.fencingStage.name,
                                        [new atlas.data.Feature(
                                            new atlas.data.LineString(_polygon.slice(_polygon.length - 2).map(o => [o.lon, o.lat]))
                                        )]);
                                }
                            } else { // Snap to first point when close enough
                                _polygon.push({lon: _polygon[0].lon, lat: _polygon[0].lat, _coordinate: _polygon[0]._coordinate });
                                // Remove the un-used layers from map
                                _mapControl.removeLayers([MAP_CONFIG.layers.fencingStage.name, MAP_CONFIG.layers.fencingBuild.name]);
                                const measureName = $('#measure').val();
                                console.warn('Polygon points: ' + JSON.stringify(_polygon) + '\nPut following statement as GEO function condition: \n\n' + 
                                    'AND 0=ST_WITHIN(' +
                                        'CreatePoint(' + measureName + '.lat, ' + measureName + '.lon), ' + 
                                        'CreatePolygon(' + _polygon.map(o => 'CreatePoint(' + o.lat + ', ' + o.lon + ')').join(', ') + '))');
                                _layerAddWrapper(
                                    MAP_CONFIG.layers.fencing.name, 
                                    [new atlas.data.Feature( 
                                        new atlas.data.Polygon([_polygon.map(o => new atlas.data.Position(o.lon, o.lat))])
                                    )]);
                                _mapMode = 'read'; 
                            }
                            break;
                        case 'radius':
                            if (!_radius.center) { // First point for radius
                                _radius.center =  { lon: event.position[0], lat: event.position[1], _coordinate: event.coordinate };
                            } else { // Complete and draw cicles
                                initializeMapLayers(MAP_CONFIG.layers.fencingBuild.name, MAP_CONFIG.layers.fencingStage.name);
                                const circlePolygonPoints = generateCirclePolygons(_radius.center, { lon: event.position[0], lat: event.position[1] });
                                _layerAddWrapper(
                                    MAP_CONFIG.layers.fencing.name, 
                                    [new atlas.data.Feature(new atlas.data.Polygon([circlePolygonPoints.map(o => new atlas.data.Position(o.lon, o.lat))]))]);
                                const measureName = $('#measure').val();
                                // 
                                // ST_DISTANCE function statement
                                // console.warn('Put following statement as query condition: \n\n' + 
                                //     'AND ST_DISTANCE(CreatePoint(' + _radius.center.lat + ', ' + _radius.center.lon + '), CreatePoint(T.' + measureName + '.lat, T.' + measureName + '.lon)) > ' + _radius.radius.meters + '-- ' + _radius.radius.meters * METER_TO_MILE + ' miles');
                                console.warn('Polygon points: ' + JSON.stringify(circlePolygonPoints) + '\nPut following statement as query condition: \n\n' + 
                                    'AND 0=ST_WITHIN(' +
                                    'CreatePoint(' + measureName + '.lat, ' + measureName + '.lon), ' + 
                                    'CreatePolygon(' + circlePolygonPoints.map(o => 'CreatePoint(' + o.lat + ', ' + o.lon + ')').join(', ') + '))');
                                _mapMode = 'read'; 
                            }
                    }

                }
            );

            // Quit geo fencing edit
            _mapControl.addEventListener('dblclick', function (event) {
                if (_mapMode === 'mark') {
                    _mapMode = 'read';
                    _polygon = [];
                    _radius = {};
                    _mapControl.removeLayers(
                        _mapControl.getLayers().filter(o => [
                            MAP_CONFIG.layers.fencing.name, 
                            MAP_CONFIG.layers.fencingBuild.name,
                            MAP_CONFIG.layers.fencingStage.name,
                        ].indexOf(o) >= 0));
                }
            });

            // Temporary connecting lines with previous point
            _mapControl.addEventListener('mousemove', function (event) {
                if (_mapMode === 'mark') {
                    // console.debug('Mouse move: ' + JSON.stringify(event));
                    initializeMapLayers(MAP_CONFIG.layers.fencingBuild.name);
                    switch (_fenceMode) {
                        case 'polygon':
                            _layerAddWrapper(
                                MAP_CONFIG.layers.fencingBuild.name,
                                [new atlas.data.Feature(
                                    new atlas.data.LineString(_polygon.slice(_polygon.length - 1).map(o => [o.lon, o.lat]).concat([event.position]))
                                )]);
                            break;
                        case 'radius':
                            _radius.radius = Object.assign(_radius.radius || {}, {
                                pixel: Math.sqrt(
                                    Math.pow(Math.abs(event.coordinate[0] - _radius.center._coordinate[0]), 2) + 
                                    Math.pow(Math.abs(event.coordinate[1] - _radius.center._coordinate[1]), 2)),
                                meters: calculateLinearDistance(_radius.center, { lon: event.position[0], lat: event.position[1] }) * MILE_TO_METER
                            });
                            
                            _layerAddWrapper(
                                MAP_CONFIG.layers.fencingBuild.name, 
                                [new atlas.data.Feature(new atlas.data.Point([_radius.center.lon, _radius.center.lat]))], {
                                    color: MAP_CONFIG.styles.overlayColor,
                                    outlineWidth: MAP_CONFIG.styles.overlayOutlineWidth,
                                    outlineColor: MAP_CONFIG.styles.overlayOutlineColor,
                                    radius: _radius.radius.pixel
                                });

                    }

                }
            });
        }

        initializeMapLayers( // Fencing* layers need to be re-initialized each time per fencing mode
            MAP_CONFIG.layers.fencingStage.name,
            MAP_CONFIG.layers.fencingBuild.name,
            MAP_CONFIG.layers.fencing.name
        );        

        // 'Submit' event on form intends to start a route drawing from scratch, so will
        // clean up map popups if any
        if (_mapPopups.length > 0) { // Close popups if any.
            _mapPopups.forEach(o => o.close());
        }
    }

    /**
     * @param {string} appId
     * @param {string} deviceId
     * @param {string} measure
     * @param {{from: Date, to: Date}} timeRange
     * 
     * @return Promise<{lon: number, lat: number}[]>
     * */
    function refreshDeviceRoute(appId, deviceId, measure, timeRange) {
        if (!appId || !deviceId || !measure) { return; }
        const unflatten = function (data) {
            if (Object(data) !== data || Array.isArray(data))
                return data;
            var regex = /\.?([^.\[\]]+)|\[(\d+)\]/g,
                resultholder = {};
            for (var p in data) {
                var cur = resultholder,
                    prop = '',
                    m;
                while (m = regex.exec(p)) {
                    cur = cur[prop] || (cur[prop] = (m[2] ? [] : {}));
                    prop = m[2] || m[1];
                }
                cur[prop] = data[p];
            }
            return resultholder[''] || resultholder;
        };

        timeRange = timeRange || {};
        timeRange.to = timeRange.to || new Date(new Date() - OFFSET_TIMEFRAME * 1000);
        timeRange.from = timeRange.from || new Date(timeRange.to - INTERVAL * 1000);
        var rdxUrl = 'http://localhost:3042/apis/environment/' + appId + '/events?' + 
                    'from=' + timeRange.from.toISOString() +
                    '&to=' + timeRange.to.toISOString() + 
                    '&filter=[iothub-connection-device-id]=\'' + deviceId + '\'';
        $.ajax(rdxUrl, {
            headers: { 'X-IoT-Subject': 'service-rdx' }
        }).fail(err => {
            return console.error(err);
        }).done(res => {
            if (res.content.events && res.content.events.length > 1) {
                var propertyMap = {};
                var deviceIdColumn = -1;
                res.content.events[0].schema.properties.forEach((o, id) => {
                    if (o.name.startsWith(measure)) { propertyMap[o.name.replace(measure + '.', '')] = id; }
                    else if (o.name === 'iothub-connection-device-id') { deviceIdColumn = id; }
                });
                if (Object.keys(propertyMap).length > 0 && deviceIdColumn >= 0) { // Found desired measurements
                    const wayPoints = res.content.events
                                        .slice(1) // Remove schema element
                                        .filter(o => o.values[deviceIdColumn] === deviceId) 
                                        .map(o => {
                                            const flattened = {};
                                            Object.keys(propertyMap).forEach(key => {
                                                flattened[key] = o.values[propertyMap[key]];
                                            });
                                            return unflatten(flattened);
                                        });
                    
                    const head = _deviceRoutes.length < 1? wayPoints[0] : _deviceRoutes[0];
                    const mid = _deviceRoutes.length < 1 ? wayPoints[0] : _deviceRoutes[_deviceRoutes.length - 1];
                    const tail = wayPoints[wayPoints.length - 1];
                    drawDeviceRoute(mid, ...wayPoints);
                    drawMapPins(head, tail);
                    changeCamera(head, tail);
                    _deviceRoutes = _deviceRoutes.concat(wayPoints);
                }
            }

            _enqueuedRefreshTimer = setTimeout(() => {
                refreshDeviceRoute(appId, deviceId, measure, {
                    from: timeRange.to,
                    to: new Date(Date.parse(timeRange.to) + INTERVAL * 1000)
                });
            }, INTERVAL * 1000);
        });
    }
    
    /**
     * @param {{lon: number, lat: number}[]} wayPoints
     * */
    function drawDeviceRoute(...wayPoints) {
        if (!wayPoints || wayPoints.length < 2) { return; }
        _layerAddWrapper(
            MAP_CONFIG.layers.route.name,
            [new atlas.data.Feature(
                new atlas.data.LineString([].concat(wayPoints.map(wp => [wp.lon, wp.lat]))))
            ]);
    }

    /*
     * @param {lon: number, lat: number, label: string}[] pins
     * */
    function drawMapPins(...pins) {
        if (!pins || pins.length < 1) { return; }
        _layerAddWrapper(
            MAP_CONFIG.layers.pin.name,
            pins.map(o => new atlas.data.Feature(new atlas.data.Point([o.lon, o.lat]))));

        // Add popups for non-head pins
        // First remove existing popups
        if (_mapPopups && _mapPopups.length > 0) {
            _mapPopups.forEach(o => o.close());
            _mapPopups = [];
        }

        pins.slice(1).forEach(p => {
            const popup = new atlas.Popup();
            queryDisance(pins[0], p)
                .then(miles => {
                    popup.setPopupOptions({
                        position: [p.lon, p.lat],
                        content: buildPopupDiv(
                            calculateLinearDistance(pins[0], p),
                            miles || 0)
                    });
                    popup.open(_mapControl);
                    _mapPopups.push(popup);
                });

        });
    }

    /*
     * param {lon: number, lat: number}[] wayPoints
     * */
    function changeCamera(...wayPoints) {
        if (!wayPoints || wayPoints.length < 1) { return; }
        const [longitudes, latitudes] = [_.uniq(wayPoints.map(o => o.lon)), _.uniq(wayPoints.map(o => o.lat))];
        
        if (longitudes.length > 1 && latitudes.length > 1) { // Set bounds for 2+ points
            // bounds: [southwest: Position, northeast: Position ]
            const currentCamera = _mapControl.getCamera();
            if (currentCamera.bounds[0] < Math.min(...longitudes) &&
                currentCamera.bounds[1] < Math.min(...latitudes) &&
                currentCamera.bounds[2] > Math.max(...longitudes) &&
                currentCamera.bounds[3] > Math.max(...latitudes)) {
                    // Current camera has a larger view ports, no need to change
                    return;
                }

            _mapControl.setCameraBounds({
                bounds: [
                    Math.min(...longitudes), 
                    Math.min(...latitudes), 
                    Math.max(...longitudes), 
                    Math.max(...latitudes)
                ],
                padding: 120
            });
        } else {
            _mapControl.setCamera({ // Only center map to first point
                center: [longitudes[0], latitudes[0]],
                // zoom: MAP_CONFIG.defaultZoom,
                duration: 1000, 
                type: 'fly'
            });
        }
    }


    /*
     * @param {number} linearDistance in miles
     * @param {number} distance in miles
     * @param {Date} timestamp
     * */
    function buildPopupDiv(linearDistance, distance) {
        const div = document.createElement('div');
        div.classList.add('map-popup-container');
        var spanHtml = '<ul>' +
                            // '<li>Time: ' + timestamp + 'miles</li>' +
                            '<li>Linear: ' + Math.round(linearDistance * 100) / 100 + ' miles</li>' +
                            '<li>Distance: ' + Math.round(distance * 100) / 100  + ' miles</li>' +
                        '</ul>';
        var span = document.createElement('span');
        span.innerHTML = spanHtml;
        div.appendChild(span);
        return div;
    }

    /* 
     * @param {lat: number, lon: number }[] wayPoints;
     * @return {Promise<number>} Distance between way-points in miles.
     * */
    function queryDisance(...wayPoints) {
        if (!wayPoints || !wayPoints.length || wayPoints.length < 1) {
            return Promise.resolve(0);
        }

        return new Promise((resolve, reject) => {
            if (wayPoints.length > 2) {
                wayPoints = [wayPoints[0], wayPoints[wayPoints.length - 1]];
            }
            const url = AZUREMAP_REST_API + '/route/directions/json' +
                '?api-version=1.0' +
                '&subscription-key=' + MAP_CONFIG.key +
                '&travelMode=car' + 
                '&query=' + wayPoints.map(p => p.lat + ',' + p.lon).join(':');
            $.get(url).done(res => {
                if (res && res.routes && res.routes.length > 0) {
                    return resolve(res.routes[0].summary.lengthInMeters * METER_TO_MILE);
                } else {
                    return resolve(undefined);
                }
            }).fail(err => {
                return reject(err);
            });
        });
    }

    /*
     * @param {number} degree
     * */
    function __degreeToRadian(degree) {
        return degree * Math.PI / 180
    }

    /*
     * @param {radian} radian
     * */
    function __radianToDegree(radian) {
        return radian * 180 / Math.PI;
    }

    /* 
     * @param {lat: number, lon: number } from;
     * @param {lat: number, lon: number } to;
     * @return {number} Linear distance between way-points in miles.
     * */
    function __calculateRadian(from, to) {
        const [deltaLat, deltaLon] = [__degreeToRadian(to.lat - from.lat), __degreeToRadian(to.lon - from.lon)];
        const [lat1, lat2] = [__degreeToRadian(from.lat), __degreeToRadian(to.lat)];
        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                  Math.sin(deltaLon/2) * Math.sin(deltaLon/2) * Math.cos(lat1) * Math.cos(lat2);
        return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /* 
     * @param {lat: number, lon: number } from;
     * @param {lat: number, lon: number } to;
     * @return {number} Linear distance between way-points in miles.
     * */
    function calculateLinearDistance(from, to) {
        const earthRadiusMiles = 6371 * 1000 * METER_TO_MILE; 
        return earthRadiusMiles * __calculateRadian(from, to);
    }

    
    /**
     *  Given a coordinate of center and one border points, returns array of points on the circle.
     *  @param {{lon: number, lat: number }} center
     *  @param {{lon: number, lat: number }} border
     *  @returns {lon: number, lat: number}[]
     * */
    function generateCirclePolygons(center, border) {
        const step = 12;
        const points = [];
        const d = __calculateRadian(center, border);
        const [lat, lon] = [__degreeToRadian(center.lat), __degreeToRadian(center.lon)];
        for (let i = 0; i < 360; i += step) {
            const brng = __degreeToRadian(i);
            const latRadians = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brng));
            const lonRadians = lon + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(latRadians));
            points.push({ lon: __radianToDegree(lonRadians), lat: __radianToDegree(latRadians) });
        }

        points.push(points[0]); // Append first point lastly
        points.reverse(); // Follow right hand rule

        return points;
    }

    /*
     * Re-initialize map layers
     * @param string[] layers
     * */
    function initializeMapLayers(...layers) {
        if (!layers || layers.length === 0) { // Default to re-initialize all
            layers = Object.keys(MAP_CONFIG.layers).map(key => MAP_CONFIG.layers[key].name).filter(o => o);
        }
        const layersToRemove = _mapControl.getLayers().filter(o => layers.indexOf(o) > -1);
        if (layersToRemove.length > 0) {
            _mapControl.removeLayers(layersToRemove);
            console.debug('Remove layers: ', layersToRemove.join(','));
        }
        layers.forEach(layer => {
            switch(layer) {
                case MAP_CONFIG.layers.route.name:
                    _layerAddWrapper(layer, [], Object.assign({ 
                        color: MAP_CONFIG.styles.routeLineColor, 
                        width: MAP_CONFIG.styles.routeLineWidth 
                    }, MAP_CONFIG.layers.route));
                break;
                case MAP_CONFIG.layers.pin.name:
                    _layerAddWrapper(layer, [], {
                        cluster: false,
                        icon: MAP_CONFIG.layers.pin.style.default,
                        overwrite: true
                    });
                break;
                case MAP_CONFIG.layers.fencingBuild.name:
                case MAP_CONFIG.layers.fencingStage.name:
                    switch (_fenceMode) {
                        // case 'radius': addCircles() will always be initialized as new layer, so do nothing here
                        case 'polygon':
                            _layerAddWrapper(layer, [], {
                                color: MAP_CONFIG.styles.lineStringColor,
                                width: MAP_CONFIG.styles.lineStringWidth
                            });
                        break;
                    }
                break;
                case MAP_CONFIG.layers.fencing.name:
                    _layerAddWrapper(layer, [], {
                        color: MAP_CONFIG.styles.overlayColor,
                        outlineColor: MAP_CONFIG.styles.overlayOutlineColor
                    });
                break;
            }
        });
    }

    /*
     * Wrap the add* methods of Map control
     * @param {string} layer - Name of the layer
     * @param {Array<Feature<G>>} - Geography object collection
     * @param {Options} - Layer options, if no options provided, layer name will be used.
     * */
    function _layerAddWrapper(layer, geography, options) {
        let addHandler;
        switch (layer) {
            case MAP_CONFIG.layers.route.name:
                addHandler = _mapControl.addLinestrings;
            break;
            case MAP_CONFIG.layers.pin.name:
                addHandler = _mapControl.addPins;
            break;
            case MAP_CONFIG.layers.fencing.name:
                // addCircle cannot zoom along with map, so use polygon to draw circles on fencing layer.
                addHandler = _mapControl.addPolygons;
            break;
            case MAP_CONFIG.layers.fencingBuild.name:
            case MAP_CONFIG.layers.fencingStage.name:
                switch (_fenceMode) {
                    case 'radius':
                        addHandler = _mapControl.addCircles;
                        break;
                    case 'polygon':
                    default:
                        addHandler = _mapControl.addLinestrings;

                }
            break;
        }

        if (addHandler) {
            options = Object.assign({ name: layer }, options);
            addHandler.bind(_mapControl)(geography, options);
            if (geography.length > 0) {
                console.debug(layer + '.' + 'draw(geography=' + JSON.stringify(geography.map(o => o.geometry.coordinates)) + ', options=' + JSON.stringify(options) + ')');
            } else {
                console.debug('Initialize layer: ' + layer);
            }
        } else {
            console.warn('Unknown layer ' + layer);
        }
    }

    /** 
     * Sets up test hook for map control operations.
     * */
    function setTestHook() {
        window._spy = {
            _map: _mapControl,
            /**
             * Creates a polygon area from map
             * @param {{lon: number, lat: number}[]} points
             */
            drawPolygon: function(...points) {
                initializeMapLayers(
                    MAP_CONFIG.layers.fencingStage.name, 
                    MAP_CONFIG.layers.fencingBuild.name,
                    MAP_CONFIG.layers.fencing.name
                );
                
                _layerAddWrapper(
                    MAP_CONFIG.layers.fencing.name, 
                    [new atlas.data.Feature( 
                        new atlas.data.Polygon([points.map(o => new atlas.data.Position(o.lon, o.lat))])
                    )]);

                const [lons, lats] = [points.map(o => o.lon), points.map(o => o.lat)];
                _mapControl.setCamera({
                    center: [
                        Math.min(...lons) + Math.abs((Math.max(...lons) - Math.min(...lons))/2), 
                        Math.min(...lats) + Math.abs((Math.max(...lats) - Math.min(...lats))/2), 
                    ],
                    duration: 1000, 
                    type: 'fly'
                });
                _mapMode = 'read';
            },

            /**
             * Creates a polygon area from map
             * @param {string} asaExpression 
             */
            parseASAExpression: function(asaExpression) {
                const regex = new RegExp(/([+-.\d]+), ?([+-.\d]+)/g)
                let match;
                const points = [];
                while (match = regex.exec(asaExpression)) {
                    points.push({lon: match[2], lat: match[1] });
                }
                window._spy.drawPolygon(...points);
            },

            ready: function() {
                const str = 'CreatePoint(position.lat, position.lon), CreatePolygon(CreatePoint(47.630443112348, -122.32542487252405), CreatePoint(47.62979521551514, -122.33456674133274), CreatePoint(47.62787988818486, -122.34330841144575), CreatePoint(47.624780972113825, -122.35126728829074), CreatePoint(47.6206341003504, -122.35809519643831), CreatePoint(47.61562073554152, -122.36349365434553), CreatePoint(47.60996020028072, -122.36722693124922), CreatePoint(47.60390005454985, -122.36913231357272), CreatePoint(47.597705247230735, -122.36912713849733), CreatePoint(47.59164652081176, -122.3672123008395), CreatePoint(47.585988578763185, -122.36347209832958), CreatePoint(47.58097853267744, -122.35807044204473), CreatePoint(47.57683513131096, -122.3512436157785), CreatePoint(47.573739237247395, -122.34328991400888), CreatePoint(47.57182596100216, -122.3345566173489), CreatePoint(47.57117878968019, -122.32542487252405), CreatePoint(47.57182596100216, -122.31629312769923), CreatePoint(47.573739237247395, -122.30755983103924), CreatePoint(47.57683513131096, -122.29960612926963), CreatePoint(47.58097853267744, -122.29277930300339), CreatePoint(47.585988578763185, -122.28737764671853), CreatePoint(47.59164652081176, -122.28363744420862), CreatePoint(47.597705247230735, -122.28172260655077), CreatePoint(47.60390005454985, -122.28171743147539), CreatePoint(47.60996020028072, -122.28362281379889), CreatePoint(47.61562073554152, -122.28735609070257), CreatePoint(47.6206341003504, -122.2927545486098), CreatePoint(47.624780972113825, -122.29958245675738), CreatePoint(47.62787988818486, -122.30754133360237), CreatePoint(47.62979521551514, -122.31628300371538), CreatePoint(47.630443112348, -122.32542487252405)';
                window._spy.parseASAExpression(str);
            }
        };
    }


})();