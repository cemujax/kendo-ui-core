kendo_module({
    id: "diagram",
    name: "Diagram",
    category: "diagram",
    depends: ["diagram.svg", "diagram.services", "data", "draganddrop"]
});

(function ($, undefined) {
    // Imports ================================================================
    var kendo = window.kendo,
        diagram = kendo.diagram,
        ui = kendo.ui,
        Widget = ui.Widget,
        Class = kendo.Class,
        proxy = $.proxy,
        deepExtend = kendo.deepExtend,
        HierarchicalDataSource = kendo.data.HierarchicalDataSource,
        Canvas = diagram.Canvas,
        Group = diagram.Group,
        Rectangle = diagram.Rectangle,
        Circle = diagram.Circle,
        CompositeTransform = diagram.CompositeTransform,
        Rect = diagram.Rect,
        Path = diagram.Path,
        DeleteShapeUnit = diagram.DeleteShapeUnit,
        DeleteConnectionUnit = diagram.DeleteConnectionUnit,
        TextBlock = diagram.TextBlock,
        Point = diagram.Point,
        Intersect = diagram.Intersect,
        ConnectionEditAdorner = diagram.ConnectionEditAdorner,
        UndoRedoService = diagram.UndoRedoService,
        ToolService = diagram.ToolService,
        Selector = diagram.Selector,
        ResizingAdorner = diagram.ResizingAdorner,
        ConnectorsAdorner = diagram.ConnectorsAdorner,
        Cursors = diagram.Cursors,
        Utils = diagram.Utils,
        Observable = kendo.Observable,
        Ticker = diagram.Ticker,
        ToBackUnit = diagram.ToBackUnit,
        ToFrontUnit = diagram.ToFrontUnit,
        Dictionary = diagram.Dictionary,
        PolylineRouter = diagram.PolylineRouter,
        CascadingRouter = diagram.CascadingRouter;

    // Constants ==============================================================
    var NS = ".kendoDiagram",
        CASCADING = "Cascading",
        POLYLINE = "Polyline",
        BOUNDSCHANGE = "boundsChange",
        ITEMSCHANGE = "itemsChange",
        CHANGE = "change",
        ERROR = "error",
        AUTO = "Auto",
        TOP = "Top",
        RIGHT = "Right",
        LEFT = "Left",
        BOTTOM = "Bottom",
        MAXINT = 9007199254740992,
        SELECT = "select",
        ROTATE = "rotate",
        PAN = "pan",
        ZOOM = "zoom",
        CONNECTION_CSS = "k-connection",
        SHAPE_CSS = "k-shape",
        CONNECTOR_CSS = "k-connector",
        DEFAULT_SHAPE_TYPE = "rectangle",
        DEFAULT_SHAPE_WIDTH = 100,
        DEFAULT_SHAPE_HEIGHT = 100,
        DEFAULT_SHAPE_MINWIDTH = 20,
        DEFAULT_SHAPE_MINHEIGHT = 20,
        DEFAULT_SHAPE_POSITION = 0,
        DEFAULT_SHAPE_STROKEWIDTH = 1,
        DEFAULT_SHAPE_STROKECOLOR = "DimGray",
        DEFAULT_SHAPE_STROKEDASH = "none",
        DEFAULT_SHAPE_BACKGROUND = "SteelBlue",
        DEFAULT_CONNECTION_BACKGROUND = "Yellow",
        DEFAULT_CONNECTION_STROKE = "Gray",
        DEFAULT_CONNECTION_STARTCAP = "FilledCircle",
        DEFAULT_CONNECTION_ENDCAP = "ArrowEnd",
        DEFAULT_CONNECTOR_SIZE = 8,
        DEFAULT_HOVER_COLOR = "#70CAFF";

    diagram.DefaultConnectors = [
        {
            name: TOP,
            description: "Top Connector"
        },
        {
            name: RIGHT,
            description: "Right Connector"
        },
        {
            name: BOTTOM,
            description: "Bottom Connector"
        },
        {
            name: LEFT,
            Description: "Left Connector"
        },
        {
            name: AUTO,
            Description: "Auto Connector",
            position: function (shape) {
                return shape.getPosition("center");
            }
        }
    ];

    var PanAdapter = kendo.Class.extend({
        init: function (panState) {
            this.pan = panState.pan;
            this.diagram = panState.diagram;
        },
        initState: function () {
            this.from = this.diagram.pan();
            this.to = this.pan;
        },
        update: function (tick) {
            this.diagram.pan(new Point(this.from.x + (this.to.x - this.from.x) * tick, this.from.y + (this.to.y - this.from.y) * tick));
        }
    });

    function resolveConnectors(connection) {
        var minDist = MAXINT,
            sourcePoint, targetPoint,
            source = connection.source(),
            target = connection.target(),
            autoSourceShape,
            autoTargetShape,
            sourceConnector,
            preferred = [0, 2, 3, 1, 4],
            k;
        if (source instanceof Point) {
            sourcePoint = source;
        }
        else if (source instanceof Connector) {
            if (source.options.name === AUTO) {
                autoSourceShape = source.shape;
            }
            else {
                connection._resolvedSourceConnector = source;
                sourcePoint = source.position();
            }
        }

        if (target instanceof Point) {
            targetPoint = target;
        }
        else if (target instanceof Connector) {
            if (target.options.name === AUTO) {
                autoTargetShape = target.shape;
            }
            else {
                connection._resolvedTargetConnector = target;
                targetPoint = target.position();
            }
        }

        if (sourcePoint) {
            if (autoTargetShape) {
                connection._resolvedTargetConnector = closestConnector(sourcePoint, autoTargetShape);
            }
        } else if (autoSourceShape) {
            if (targetPoint) {
                connection._resolvedSourceConnector = closestConnector(targetPoint, autoSourceShape);
            } else if (autoTargetShape) {

                for (var i = 0; i < autoSourceShape.connectors.length; i++) {
                    if (autoSourceShape.connectors.length == 5) // presuming this means the default connectors
                    {
                        // will emphasize the vertical or horizontal direction, which matters when using the cascading router and distances which are equal for multiple connectors.
                        k = preferred[i];
                    }
                    else {
                        k = i;
                    }
                    sourceConnector = autoSourceShape.connectors[k];
                    if (sourceConnector.options.name !== AUTO) {
                        var currentSourcePoint = sourceConnector.position(),
                            currentTargetConnector = closestConnector(currentSourcePoint, autoTargetShape);
                        var dist = Math.round(currentTargetConnector.position().distanceTo(currentSourcePoint)); // rounding prevents some not needed connectors switching.
                        if (dist < minDist) {
                            minDist = dist;
                            connection._resolvedSourceConnector = sourceConnector;
                            connection._resolvedTargetConnector = currentTargetConnector;
                        }
                    }
                }
            }
        }
    }

    function closestConnector(point, shape) {
        var minimumDistance = MAXINT, resCtr, ctrs = shape.connectors;
        for (var i = 0; i < ctrs.length; i++) {
            var ctr = ctrs[i];
            if (ctr.options.name !== AUTO) {
                var dist = point.distanceTo(ctr.position());
                if (dist < minimumDistance) {
                    minimumDistance = dist;
                    resCtr = ctr;
                }
            }
        }
        return resCtr;
    }

    function indicesOfItems(group, visuals) {
        var i, indices = [], visual;
        for (i = 0; i < visuals.length; i++) {
            visual = visuals[i];
            for (var j = 0; j < group.children.length; j++) {
                var other = group.children[j];
                if (other == visual.native) {
                    indices.push(j);
                    break;
                }
            }
        }
        return indices;
    }

    function deserializeConnector(diagram, value) {
        var point = Point.parse(value), ctr;
        if (point) {
            return point;
        }
        ctr = Connector.parse(diagram, value);
        if (ctr) {
            return ctr;
        }
    }

    var DiagramElement = Observable.extend({
        init: function (options, model) {
            var that = this;
            Observable.fn.init.call(that);
            that.options = deepExtend({id: kendo.diagram.randomId()}, that.options, options);
            that.isSelected = false;
            that.model = model;
            that.visual = new Group({
                id: that.options.id,
                cssClass: that.options.cssClass
            });
            that.options.cssClass = undefined; // Clean the class so that is not propagated toward inner elements.
            that._template();
        },
        options: {
            background: "Green",
            hoveredBackground: "#70CAFF",
            cursor: Cursors.grip
        },
        _getCursor: function (point) {
            if (this.adorner) {
                return this.adorner._getCursor(point);
            }
            return Cursors.select;
        },
        visible: function (value) {
            if (Utils.isUndefined(value)) {
                return this.visual.visible();
            }
            else {
                this.visual.visible(value);
            }
        },
        bounds: function () {
        },
        refresh: function () {
            this.visual.redraw();
        },
        position: function (point) {
            this.options.x = point.x;
            this.options.y = point.y;
            this.visual.position(point);
        },
        toString: function () {
            return this.options.id;
        },
        serialize: function () {
            // the options json object describes the shape perfectly. So this object can serve as shape serialization.
            var json = deepExtend({}, {options: this.options});
            if (this.model) {
                json.model = this.model.toString();
            }
            return json;
        },
        content: function (content) {
            if (content !== undefined) {
                if (!content) {
                    if (this.contentVisual) {
                        this.visual.remove(this.contentVisual);
                    }
                    this.contentVisual = undefined;
                    this.options.content = "";
                }
                else {
                    var bounds = this.bounds();
                    if (this.contentVisual && this.contentVisual instanceof TextBlock) {
                        this.contentVisual.options.text = content.toString();
                    }
                    else {
                        this.contentVisual = new TextBlock({
                            text: content.toString(),
                            align: "center middle",
                            x: bounds.x,
                            y: bounds.y,
                            width: bounds.width,
                            height: bounds.height,
                            autoSize: this.options.autoSize
                        });

                        this.visual.append(this.contentVisual);
                    }
                    this.options.content = content.toString();
                    this.contentVisual.redraw();
                    this.refresh();
                }
            }

            return this.contentVisual ? this.contentVisual.content() : "";
        },
        _hitTest: function (point) {
            var bounds = this.bounds();
            return this.visible() && bounds.contains(point);
        },
        _template: function () {
            var that = this;
            if (that.options.template && that.model) {
                that.options.content = kendo.template(that.options.template, {paramName: "item"})(that.model);
            }
        }
    });

    var Connector = Class.extend({
        init: function (shape, options) {
            this.options = deepExtend({}, this.options, options);
            this.connections = [];
            this.shape = shape;
        },
        options: {
            width: DEFAULT_CONNECTOR_SIZE,
            height: DEFAULT_CONNECTOR_SIZE,
            background: DEFAULT_CONNECTION_BACKGROUND,
            hoveredBackground: DEFAULT_HOVER_COLOR,
            cssClass: CONNECTOR_CSS
        },
        position: function () {
            if (this.options.position) {
                return this.options.position(this.shape);
            }
            else {
                return this.shape.getPosition(this.options.name);
            }
        },
        toString: function () {
            return kendo.format("{0}: {1}", this.shape.toString(), this.options.name);
        }
    });

    Connector.parse = function (diagram, str) {
        var tempStr = str.split(":"),
            id = tempStr[0],
            name = tempStr[1] || AUTO;

        for (var i = 0; i < diagram.shapes.length; i++) {
            var shape = diagram.shapes[i];
            if (shape.options.id == id) {
                return shape.getConnector(name.trim());
            }
        }
    };

    var Shape = DiagramElement.extend({
        init: function (options, model) {
            var that = this, connector, i;
            DiagramElement.fn.init.call(that, options, model);
            options = that.options;
            that.connectors = [];
            that.type = options.type;
            that.shapeVisual = Shape.createShapeVisual(that.options);
            that.visual.append(this.shapeVisual);
            that.bounds(new Rect(options.x, options.y, Math.floor(options.width), Math.floor(options.height)));
            var length = options.connectors.length;
            for (i = 0; i < length; i++) {
                connector = new Connector(that, options.connectors[i]);
                that.connectors.push(connector);
            }
            // TODO: Swa added for phase 2; included here already because the GraphAdapter takes it into account
            that.parentContainer = null;
            that.isContainer = false;
            that.isCollapsed = false;
            that.id = that.visual.native.id;
            if (Utils.isDefined(options.content)) {
                that.content(options.content);
            }
            that._rotate();
        },
        options: {
            type: "Shape",
            cssClass: SHAPE_CSS,
            data: DEFAULT_SHAPE_TYPE,
            stroke: DEFAULT_SHAPE_STROKECOLOR,
            strokeWidth: DEFAULT_SHAPE_STROKEWIDTH,
            strokeDashArray: DEFAULT_SHAPE_STROKEDASH,
            x: DEFAULT_SHAPE_POSITION,
            y: DEFAULT_SHAPE_POSITION,
            minWidth: DEFAULT_SHAPE_MINWIDTH,
            minHeight: DEFAULT_SHAPE_MINHEIGHT,
            width: DEFAULT_SHAPE_WIDTH,
            height: DEFAULT_SHAPE_HEIGHT,
            background: DEFAULT_SHAPE_BACKGROUND,
            hoveredBackground: DEFAULT_HOVER_COLOR,
            connectors: diagram.DefaultConnectors,
            rotation: {
                angle: 0
            },
            content: ""
        },
        bounds: function (value) {
            var point, size, bounds, options;
            if (value) {
                if (Utils.isString(value)) {
                    switch (value) {
                        case "transformed" :
                            bounds = this._transformedBounds();
                            break;
                        case "rotated" :
                            bounds = this._rotatedBounds();
                            break;
                        default:
                            bounds = this._bounds;
                    }
                }
                else { // we assume Rect.
                    options = this.options;
                    this._bounds = value;
                    if (this.contentVisual) {
                        this.contentVisual.redraw(this._bounds);
                    }
                    point = value.topLeft();
                    options.x = point.x;
                    options.y = point.y;
                    this.visual.position(point);

                    options.width = value.width;
                    options.height = value.height;
                    this.shapeVisual.redraw({ width: value.width, height: value.height });
                    this.refreshConnections();
                    this._triggerBoundsChange();
                }
            }
            else {
                bounds = this._bounds;
            }
            if (this.contentVisual && !this.contentVisual._measured) {
                this.contentVisual.redraw(this._bounds);
            }
            if (!this.shapeVisual._measured && this.options.width === DEFAULT_SHAPE_WIDTH && this.options.height === DEFAULT_SHAPE_HEIGHT) { // no dimensions, assuming autosize for paths, groups...
                size = this.shapeVisual._measure();
                if (size) {
                    if (this.shapeVisual.options.autoSize) {
                        this.bounds(new Rect(this.options.x, this.options.y, size.width, size.height));
                    }
                    else {
                        this.shapeVisual.redraw();
                    }
                }
            }
            return bounds;
        },
        position: function (point) {
            if (point) {
                this.bounds(new Rect(point.x, point.y, this._bounds.width, this._bounds.height));
            }
            else {
                return this._bounds.topLeft();
            }
        },
        /**
         * Returns a clone of this shape.
         * @returns {Shape}
         */
        clone: function () {
            var json = this.serialize();
            json.options.id = kendo.diagram.randomId();
            var clone = new Shape(json.options);
            clone.diagram = this.diagram;
            /*clone.visual.native.id = clone.id;
             clone.visual.id = clone.id;
             clone.options.id = clone.id;*/
            return clone;
        },
        select: function (value) {
            if (Utils.isUndefined(value)) {
                value = true;
            }
            if (this.isSelected != value) {
                this.isSelected = value;
                if (this.isSelected) {
                    this.diagram._selectedItems.push(this);
                } else {
                    this.diagram._selectedItems.remove(this);
                }
                if (!this.diagram._internalSelection) {
                    this.diagram.trigger(SELECT, {items: [this]});
                }
            }
        },
        rotate: function (angle, center) { // we assume the center is always the center of the shape.
            var rotate = this.visual.rotate();
            if (angle !== undefined) {
                var b = this.bounds(),
                    sc = new Point(b.width / 2, b.height / 2),
                    deltaAngle,
                    newPosition;

                if (center) {
                    deltaAngle = angle - rotate.angle;
                    newPosition = b.center().rotate(center, 360 - deltaAngle).minus(sc);
                    this._rotationOffset = this._rotationOffset.plus(newPosition.minus(b.topLeft()));
                    this.position(newPosition);
                }
                this.visual.rotate(angle, sc);
                this.options.rotation.angle = angle;

                if (this.diagram && this.diagram._connectorsAdorner) {
                    this.diagram._connectorsAdorner.refresh();
                }
                this.refreshConnections();
                if (this.diagram) {
                    this.diagram.trigger(ROTATE, {item: this});
                }
            }

            return rotate;
        },
        connections: function (type) { // in, out, undefined = both
            var result = [], i, j, con, cons, ctr;

            for (i = 0; i < this.connectors.length; i++) {
                ctr = this.connectors[i];
                cons = ctr.connections;
                for (j = 0, cons; j < cons.length; j++) {
                    con = cons[j];
                    if (type == "out") {
                        var source = con.source();
                        if (source.shape && source.shape == this) {
                            result.push(con);
                        }
                    }
                    else if (type == "in") {
                        var target = con.target();
                        if (target.shape && target.shape == this) {
                            result.push(con);
                        }
                    }
                    else {
                        result.push(con);
                    }
                }
            }
            return result;
        },
        refreshConnections: function () {
            $.each(this.connections(), function () {
                this.refresh();
            });
        },
        /**
         * Gets a connector of this shape either by the connector's supposed name or
         * via a Point in which case the closest connector will be returned.
         * @param nameOrPoint The name of a Connector or a Point.
         * @returns {Connector}
         */
        getConnector: function (nameOrPoint) {
            var i, ctr;
            if (Utils.isString(nameOrPoint)) {
                nameOrPoint = nameOrPoint.toLocaleLowerCase();
                for (i = 0; i < this.connectors.length; i++) {
                    ctr = this.connectors[i];
                    if (ctr.options.name.toLocaleLowerCase() == nameOrPoint) {
                        return ctr;
                    }
                }
            }
            else if (nameOrPoint instanceof Point) {
                return closestConnector(nameOrPoint, this);
            }
            else {
                return this.connectors.length ? this.connectors[0] : null;
            }
        },
        getPosition: function (side) {
            var b = this.bounds(),
                fnName = side[0].toLowerCase() + side.slice(1);
            if (Utils.isFunction(b[fnName])) {
                return this._transformPoint(b[fnName]());
            }
            return b.center();
        },
        redraw: function (options) {
            if (options) {
                this.options = deepExtend({}, this.options, options);
            }
            if (Utils.isDefined(this.options.content)) {
                this.content(this.options.content);
            }
            this.shapeVisual.redraw(options);
        },
        _triggerBoundsChange: function () {
            if (this.diagram) {
                this.diagram.trigger(BOUNDSCHANGE, {item: this, bounds: this._bounds.clone()}); // the trigger modifies the arguments internally.
            }
        },
        _transformPoint: function (absolutePoint) {
            var rotate = this.rotate(),
                bounds = this.bounds(),
                tl = bounds.topLeft(),
                result = absolutePoint;

            if (rotate.angle) {
                result.rotate(rotate.center().plus(tl), 360 - rotate.angle);
            }
            return result;
        },
        _transformedBounds: function () {
            var bounds = this.bounds(),
                tl = bounds.topLeft(),
                br = bounds.bottomRight();
            return Rect.fromPoints(this.diagram.toOrigin(tl), this.diagram.toOrigin(br));
        },
        _rotatedBounds: function () {
            var bounds = this.bounds().rotatedBounds(this.rotate().angle),
                tl = bounds.topLeft(),
                br = bounds.bottomRight();

            return Rect.fromPoints(tl, br);
        },
        _rotate: function () {
            var rotation = this.options.rotation;
            if (rotation && rotation.angle) {
                this.rotate(rotation.angle);
            }
            this._rotationOffset = new Point();
        },
        _hover: function (value) {
            this.shapeVisual._hover(value);
            this.diagram._showConnectors(this, value);
        },
        _hitTest: function (value) {
            if (this.visible()) {
                var bounds = this.bounds(), rotatedPoint,
                    angle = this.rotate().angle;
                if (value.isEmpty && !value.isEmpty()) { // rect selection
                    return Intersect.rects(value, bounds, angle ? angle : 0);
                }
                else { // point
                    rotatedPoint = value.clone().rotate(bounds.center(), angle); // cloning is important because rotate modifies the point inline.
                    if (bounds.contains(rotatedPoint)) {
                        return this;
                    }
                }
            }
        }
    });

    Shape.createShapeVisual = function (options) {
        var shapeOptions = deepExtend({}, options, { x: 0, y: 0 }),
            visualTemplate = shapeOptions.data; // Shape visual should not have position in its parent group.
        if (Utils.isString(visualTemplate)) {
            switch (shapeOptions.data.toLocaleLowerCase()) {
                case "rectangle":
                    return new Rectangle(shapeOptions);
                case "circle":
                    return new Circle(shapeOptions);
                case "text": // Maybe should be something else.
                    return new Rectangle(shapeOptions);
                default:
                    var p = new Path(shapeOptions);
                    return p;
            }
        }
        else if (Utils.isFunction(visualTemplate)) {// custom template
            return visualTemplate(shapeOptions.context);
        }
        return new Rectangle(shapeOptions);
    };

    /**
     * The visual link between two Shapes through the intermediate of Connectors.
     */
    var Connection = DiagramElement.extend({
        init: function (from, to, options, model) {
            var that = this;
            DiagramElement.fn.init.call(that, options, model);
            that._router = new PolylineRouter(this);
            that.path = new Path(that.options);
            that.path.background("none");
            that.visual.append(that.path);
            that._sourcePoint = that._targetPoint = new Point();
            that.source(from);
            that.target(to);
            that.content(that.options.content);
            that.definers = [];
            if (Utils.isDefined(options) && options.points) {
                that.points(options.points);
            }
            that.refresh();
        },
        options: {
            stroke: DEFAULT_CONNECTION_STROKE,
            hoveredStroke: DEFAULT_HOVER_COLOR,
            startCap: DEFAULT_CONNECTION_STARTCAP,
            endCap: DEFAULT_CONNECTION_ENDCAP,
            points: [],
            cssClass: CONNECTION_CSS
        },

        /**
         * Gets the Point where the source of the connection resides.
         * If the endpoint in Auto-connector the location of the resolved connector will be returned.
         * If the endpoint is floating the location of the endpoint is returned.
         */
        sourcePoint: function () {
            return this._resolvedSourceConnector ? this._resolvedSourceConnector.position() : this._sourcePoint;
        },

        /**
         * Gets or sets the Point where the source of the connection resides.
         * @param source The source of this connection. Can be a Point, Shape, Connector.
         * @param undoable Whether the change or assignment should be undoable.
         */
        source: function (source, undoable) {
            if (Utils.isDefined(source)) {
                if (undoable && this.diagram) {
                    this.diagram.undoRedoService.addCompositeItem(new kendo.diagram.ConnectionEditUnit(this, source));
                }
                else {
                    if (source !== undefined) {
                        this.from = source;
                    }
                    if (source === null) { // detach
                        if (this.sourceConnector) {
                            this._sourcePoint = this._resolvedSourceConnector.position();
                            this._clearSourceConnector();
                        }
                    }
                    else if (source instanceof Connector) {
                        this.sourceConnector = source;
                        this.sourceConnector.connections.push(this);
                        this.refresh();
                    }
                    else if (source instanceof Point) {
                        this._sourcePoint = source;
                        if (this.sourceConnector) {
                            this._clearSourceConnector();
                        }
                        this.refresh();
                    }
                    else if (source instanceof Shape) {
                        this.sourceConnector = source.getConnector(AUTO);// source.getConnector(this.targetPoint());
                        this.sourceConnector.connections.push(this);
                        this.refresh();
                    }
                }
            }
            return this.sourceConnector ? this.sourceConnector : this._sourcePoint;
        },

        /**
         * Gets or sets the PathDefiner of the sourcePoint.
         * The left part of this definer is always null since it defines the source tangent.
         * @param value
         * @returns {*}
         */
        sourceDefiner: function (value) {
            if (value) {
                if (value instanceof diagram.PathDefiner) {
                    value.left = null;
                    this._sourceDefiner = value;
                    this.source(value.point); // refresh implicit here
                }
                else {
                    throw "The sourceDefiner needs to be a PathDefiner.";
                }
            } else {
                if (!this._sourceDefiner) {
                    this._sourceDefiner = new diagram.PathDefiner(this.sourcePoint(), null, null);
                }
                return this._sourceDefiner;
            }
        },

        /**
         * Gets  the Point where the target of the connection resides.
         */
        targetPoint: function () {
            return this._resolvedTargetConnector ? this._resolvedTargetConnector.position() : this._targetPoint;
        },
        /**
         * Gets or sets the Point where the target of the connection resides.
         * @param target The target of this connection. Can be a Point, Shape, Connector.
         * @param undoable  Whether the change or assignment should be undoable.
         */
        target: function (target, undoable) {
            if (Utils.isDefined(target)) {
                if (undoable && this.diagram) {
                    this.diagram.undoRedoService.addCompositeItem(new kendo.diagram.ConnectionEditUnit(this, target));
                }
                else {
                    if (target !== undefined) {
                        this.to = target;
                    }
                    if (target === null) { // detach
                        if (this.targetConnector) {
                            this._targetPoint = this._resolvedTargetConnector.position();
                            this._clearTargetConnector();
                        }
                    }
                    else if (target instanceof Connector) {
                        this.targetConnector = target;
                        this.targetConnector.connections.push(this);
                        this.refresh();
                    }
                    else if (target instanceof Point) {
                        this._targetPoint = target;
                        if (this.targetConnector) {
                            this._clearTargetConnector();
                        }
                        this.refresh();
                    }
                    else if (target instanceof Shape) {
                        this.targetConnector = target.getConnector(AUTO);// target.getConnector(this.sourcePoint());
                        this.targetConnector.connections.push(this);
                        this.refresh();
                    }
                }
            }
            return this.targetConnector ? this.targetConnector : this._targetPoint;
        },
        /**
         * Gets or sets the PathDefiner of the targetPoint.
         * The right part of this definer is always null since it defines the target tangent.
         * @param value
         * @returns {*}
         */
        targetDefiner: function (value) {
            if (value) {
                if (value instanceof diagram.PathDefiner) {
                    value.right = null;
                    this._targetDefiner = value;
                    this.target(value.point); // refresh implicit here
                }
                else {
                    throw "The sourceDefiner needs to be a PathDefiner.";
                }
            } else {
                if (!this._targetDefiner) {
                    this._targetDefiner = new diagram.PathDefiner(this.targetPoint(), null, null);
                }
                return this._targetDefiner;
            }
        },
        /**
         * Selects or unselects this connections.
         * @param value True to select, false to unselect.
         */
        select: function (value) {
            if (this.isSelected !== value) {
                this.isSelected = value;
                if (this.isSelected) {
                    this.adorner = new ConnectionEditAdorner(this);
                    this.diagram._adorn(this.adorner, true);
                    this.diagram._selectedItems.push(this);
                } else {
                    if (this.adorner) {
                        this.diagram._adorn(this.adorner, false);
                        this.diagram._selectedItems.remove(this);
                        this.adorner = undefined;
                    }
                }
                this.refresh();
                if (!this.diagram._internalSelection) {
                    this.diagram.trigger(SELECT, {items: [this]});
                }
            }
        },
        /**
         * Gets or sets the bounds of this connection.
         * @param value A Rect object.
         * @remark This is automatically set in the refresh().
         * @returns {Rect}
         */
        bounds: function (value) {
            if (value) {
                this._bounds = value;
            } else {
                return this._bounds;
            }
        },
        /**
         * Gets or sets the connection type (see ConnectionType enumeration).
         * @param value A ConnectionType value.
         * @returns {ConnectionType}
         */
        type: function (value) {
            if (value) {
                if (value !== this._type) {
                    this._type = value;
                    switch (value.toLowerCase()) {
                        case CASCADING.toLowerCase():
                            this._router = new CascadingRouter(this);
                            break;
                        case POLYLINE.toLowerCase():
                            this._router = new PolylineRouter(this);
                            break;
                        default:
                            throw "Unsupported connection type.";
                    }
                    this.refresh();
                }
            }
            else {
                return this._type;
            }
        },
        /**
         * Gets or sets the collection of *intermediate* points.
         * The 'allPoints()' property will return all the points.
         * The 'definers' property returns the definers of the intermediate points.
         * The 'sourceDefiner' and 'targetDefiner' return the definers of the endpoints.
         * @param value
         */
        points: function (value) {
            if (value) {
                this.definers = [];
                for (var i = 0; i < value.length; i++) {
                    var definition = value[i];
                    if (definition instanceof diagram.Point) {
                        this.definers.push(new diagram.PathDefiner(definition));
                    }
                    else if (definition.hasOwnProperty("x") && definition.hasOwnProperty("y")) { // e.g. Clipboard does not preserve the Point definition and tunred into an Object
                        this.definers.push(new diagram.PathDefiner(new Point(definition.x, definition.y)));
                    }
                    else {
                        throw "A Connection point needs to be a Point or an object with x and y properties.";
                    }
                }

            } else {
                var pts = [];
                if (Utils.isDefined(this.definers)) {
                    for (var k = 0; k < this.definers.length; k++) {
                        pts.push(this.definers[k].point);
                    }
                }
                return pts;
            }
        },
        /**
         * Gets all the points of this connection. This is the combination of the sourcePoint, the points and the targetPoint.
         * @returns {Array}
         */
        allPoints: function () {
            var pts = [this.sourcePoint()];
            if (this.definers) {
                for (var k = 0; k < this.definers.length; k++) {
                    pts.push(this.definers[k].point);
                }
            }
            pts.push(this.targetPoint());
            return pts;
        },
        refresh: function () {
            resolveConnectors(this);
            var globalSourcePoint = this.sourcePoint(), globalSinkPoint = this.targetPoint(),
                boundsTopLeft, localSourcePoint, localSinkPoint, middle;

            // this.visual.position(boundsTopLeft);    //global coordinates!
            this._refreshPath();

            boundsTopLeft = this._bounds.topLeft();
            localSourcePoint = globalSourcePoint.minus(boundsTopLeft);
            localSinkPoint = globalSinkPoint.minus(boundsTopLeft);
            if (this.contentVisual) {
                middle = Point.fn.middleOf(localSourcePoint, localSinkPoint);
                this.contentVisual.position(new Point(middle.x + boundsTopLeft.x, middle.y + boundsTopLeft.y));
            }

            if (this.adorner) {
                this.adorner.refresh();
            }
        },
        redraw: function (options) {
            this.options = deepExtend({}, this.options, options);
            this.content(this.options.content);
            if (Utils.isDefined(this.options.points) && this.options.points.length > 0) {
                this.points(this.options.points);
                this._refreshPath();
            }
            this.path.redraw(options);
        },
        /**
         * Returns a clone of this connection.
         * @returns {Connection}
         */
        clone: function () {
            var json = this.serialize(),
                clone = new Connection(this.from, this.to, json.options);
            clone.diagram = this.diagram;

            return clone;
        },
        /**
         * Returns a serialized connection in json format. Consist of the options and the model.
         * @returns {Connection}
         */
        serialize: function () {
            var json = deepExtend({},
                {
                    options: this.options,
                    from: this.from.toString(),
                    to: this.to.toString()
                });
            if (this.model) {
                json.model = this.model.toString();
            }
            json.options.points = this.points();
            return json;
        },

        /**
         * Returns whether the given Point or Rect hits this connection.
         * @param value
         * @returns {Connection}
         * @private
         */
        _hitTest: function (value) {
            if (this.visible()) {
                var p = new Point(value.x, value.y), from = this.sourcePoint(), to = this.targetPoint();
                if (value.isEmpty && !value.isEmpty() && value.contains(from) && value.contains(to)) {
                    return this;
                }
                if (this._router.hitTest(p)) {
                    return this;
                }
            }
        },
        _hover: function (value) {
            this.path.redraw({ stroke: value ? this.options.hoveredStroke : this.options.stroke });
        },
        /**
         * Using the current router with the endpoints and intermediate points, this returns the Path data to be drawn.
         * @private
         */
        _calcPathData: function () {
            if (this._router) {
                this._router.route(); // sets the intermediate points
            }
            function pr(point) {
                return point.x + " " + point.y;
            }

            // for now let's take the heuristic approach, more complete API later
            var from = this.sourcePoint();
            var end = this.targetPoint();
            var data = "M" + pr(from);

            var points = this.points();
            for (var i = 0; i < points.length; i++) {
                var point = points[i];
                data += " L" + pr(point);
            }
            return data + " L" + pr(end);
        },
        _refreshPath: function () {
            if (Utils.isUndefined(this.path)) {
                return;
            }
            this._drawPath(this._calcPathData());
            this.bounds(this._router.getBounds());
        },
        _drawPath: function (data) {
            this.path.redraw({ data: data  });
        },
        _clearSourceConnector: function () {
            this.sourceConnector.connections.remove(this);
            this.sourceConnector = undefined;
            this._resolvedSourceConnector = undefined;
        },
        _clearTargetConnector: function () {
            this.targetConnector.connections.remove(this);
            this.targetConnector = undefined;
            this._resolvedTargetConnector = undefined;
        }
    });

    var Diagram = Widget.extend({
        init: function (element, options) {
            var that = this;
            Widget.fn.init.call(that, element, options);

            element = that.element; // the hosting element

            that.element.addClass("k-widget k-diagram").attr("role", "diagram");
            var canvasContainer = $("<div class='k-canvas-container'></div>").appendTo(element)[0];
            that.canvas = new Canvas(canvasContainer); // the root SVG Canvas
            that.scrollable = $("<div />").appendTo(that.element).append(that.canvas.element);

            this.mainLayer = new Group({
                id: "main-layer"
            });
            this.canvas.append(this.mainLayer);
            this.adornerLayer = new Group({
                id: "adorner-layer"
            });
            this.canvas.append(this.adornerLayer);

            this.toolService = new ToolService(this);
            this._attachEvents();
            that._initialize();
            that._fetchFreshData();
            this._resizingAdorner = new ResizingAdorner(this, { resizable: this.options.resizable, rotatable: this.options.rotatable});
            this._connectorsAdorner = new ConnectorsAdorner(this);

            this._adorn(this._resizingAdorner, true);
            this._adorn(this._connectorsAdorner, true);
            that.element.on("mousemove" + NS, proxy(that._mouseMove, that))
                .on("mouseup" + NS, proxy(that._mouseUp, that))
                .on("dblclick" + NS, proxy(that._doubleClick, that))
                .on("mousedown" + NS, proxy(that._mouseDown, that))
                .mousewheel(proxy(that._wheel, that), { ns: NS })
                .on("keydown" + NS, proxy(that._keydown, that));
            that.selector = new Selector(that);
            // TODO: We may consider using real Clipboard, but is very hacky to do so.
            that._clipboard = [];
            that._drop();
        },
        options: {
            name: "Diagram",
            zoomRate: 1.1,
            dataSource: {},
            dragAndDrop: true,
            template: "",
            autoBind: true,
            resizable: true,
            rotatable: true,
            visualTemplate: null,
            tooltip: { enabled: true, format: "{0}" },
            copy: {
                enabled: true,
                offsetX: 20,
                offsetY: 20
            }
        },
        
        events: [ZOOM, PAN, SELECT, ROTATE, BOUNDSCHANGE, ITEMSCHANGE],
        
        destroy: function () {
            var that = this;
            Widget.fn.destroy.call(that);

            that.clear();
            that.element.off(NS);
            // TODO: Destroy all the shapes, connections and the tons of other stuff!
            that.canvas.element.removeChild(that.canvas.native);
            that.canvas = undefined;

            if (that.scroller) {
                that.scroller.destroy();
                that.scroller.element.remove();
            }
        },
        save: function () {
            var json = {}, i, shape, con;
            json.options = this.options;
            json.shapes = [];
            json.connections = [];
            for (i = 0; i < this.shapes.length; i++) {
                shape = this.shapes[i];
                json.shapes.push({options: shape.options});
            }

            for (i = 0; i < this.connections.length; i++) {
                con = this.connections[i];
                json.connections.push({options: con.options, from: con.from.toString(), to: con.to.toString()});
            }
            return json;
        },
        load: function (json) {
            var i, options, con;
            this.options = json.options;
            this.clear();
            this._fetchFreshData();
            for (i = 0; i < json.shapes.length; i++) {
                options = json.shapes[i].options;
                options.undoable = false;
                this.addShape(new Shape(options));
            }

            for (i = 0; i < json.connections.length; i++) {
                con = json.connections[i];
                options = con.options;
                options.undoable = false;
                var from = deserializeConnector(this, con.from);
                var to = deserializeConnector(this, con.to);
                this.addConnection(new Connection(from, to, options));
            }
        },
        focus: function () {
            var x = window.scrollX, y = window.scrollY;
            this.canvas.focus();
            window.scrollTo(x, y); // prevent the annoying scroll to top of the canvas (div).
        },
        clear: function () {
            var that = this;
            if (that.dataSource) {
                that._unbindDataSource();
            }

            that.select(false);
            that.mainLayer.clear();
            that._initialize();
        },
        /**
         * Connects two items.
         * @param source Shape, Connector, Point.
         * @param target Shape, Connector, Point.
         * @param options Connection options that will be passed to the newly created connection.
         * @returns The newly created connection.
         */
        connect: function (source, target, options) {
            var connection = new Connection(source, target, options);
            return this.addConnection(connection);
        },
        /**
         * Determines whether the the two items are connected.
         * @param source Shape, Connector, Point.
         * @param target Shape, Connector, Point.
         * @returns true if the two items are connected.
         */
        connected: function (source, target) {
            for (var i = 0; i < this.connections.length; i++) {
                var c = this.connections[i];
                if (c.from == source && c.to == target) {
                    return true;
                }
            }
            return false;
        },
        /**
         * Adds connection to the diagram.
         * @param connection Connection.
         * @param undoable Boolean.
         * @returns The newly created connection.
         */
        addConnection: function (connection, undoable) {
            if (undoable === undefined) {
                undoable = true;
            }
            if (undoable) {
                var unit = new kendo.diagram.AddConnectionUnit(connection, this);
                this.undoRedoService.add(unit);
            }
            else {
                connection.diagram = this;
                this.mainLayer.append(connection.visual);
                this.connections.push(connection);
            }

            return connection;
        },
        /**
         * Adds shape to the diagram.
         * @param item Shape, Point. If point is passed it will be created new Shape and positioned at that point.
         * @param options. The options to be passed to the newly created Shape.
         * @returns The newly created shape.
         */
        addShape: function (item, options) {
            var shape;
            options = deepExtend({undoable: true}, options);

            if (Utils.isUndefined(item)) {
                item = new Point(0, 0);
            }
            if (item instanceof Shape) {
                shape = item;
            }
            else { // consider it a point
                options = deepExtend(options, { x: item.x, y: item.y });
                shape = new Shape(options);
            }
            if (options.undoable === true) {
                var unit = new kendo.diagram.AddShapeUnit(shape, this);
                this.undoRedoService.add(unit);
            }
            else {
                this.shapes.push(shape);
                shape.diagram = this;
                this.mainLayer.append(shape.visual);
            }

            this._raiseItemsAdded([shape]);

            return shape;
        },
        /**
         * Removes items (or single item) from the diagram.
         * @param items DiagramElement, Array of Items.
         * @param undoable.
         */
        remove: function (items, undoable) {
            var isMultiple = $.isArray(items);

            if (Utils.isUndefined(undoable)) {
                undoable = true;
            }
            if (undoable) {
                this.undoRedoService.begin();
            }
            if (isMultiple) {
                items = items.slice(0);
                for (var i = 0; i < items.length; i++) {
                    this._removeItem(items[i], undoable);
                }
            }
            else if (items instanceof Shape || items instanceof Connection) {
                this._removeItem(items, undoable);
            }
            if (undoable) {
                this.undoRedoService.commit();
            }

            this._raiseItemsRemoved(isMultiple ? items : [items]);
        },
        /**
         * Executes the next undoable action on top of the undo stack if any.
         */
        undo: function () {
            this.undoRedoService.undo();
        },
        /**
         * Executes the previous undoable action on top of the redo stack if any.
         */
        redo: function () {
            this.undoRedoService.redo();
        },
        /**
         * Selects items on the basis of the given input or returns the current selection if none.
         * @param itemsOrRect DiagramElement, Array of elements, "All", false or Rect. A value 'false' will deselect everything.
         * @param options
         * @returns {Array}
         */
        select: function (itemsOrRect, options) {
            var i, item, items, rect, selected = [];
            options = deepExtend({  addToSelection: false }, options);
            var addToSelection = options.addToSelection;

            if (itemsOrRect !== undefined) {
                if (!addToSelection) {
                    while (this._selectedItems.length > 0) {
                        this._selectedItems[0].select(false);
                    }
                }
                if (Utils.isBoolean(itemsOrRect)) {
                    if (itemsOrRect !== false) {
                        this.select("All");
                    }
                }
                else if (itemsOrRect.toString().toLowerCase() === "none") {
                    this.select(false);
                }
                else if (itemsOrRect.toString().toLowerCase() === "all") {
                    items = this.shapes.concat(this.connections);
                    this._internalSelection = true;
                    for (i = 0; i < items.length; i++) {
                        item = items[i];
                        item.select(true);
                        selected.push(item);
                    }
                }
                else if (itemsOrRect instanceof Rect) {
                    rect = itemsOrRect;
                    items = this.shapes.concat(this.connections);
                    this._internalSelection = true;
                    for (i = 0; i < items.length; i++) {
                        item = items[i];
                        if (!rect || item._hitTest(rect)) {
                            item.select(true);
                            selected.push(item);
                        }
                    }
                }
                else if (itemsOrRect instanceof Array) {
                    for (i = 0; i < itemsOrRect.length; i++) {
                        item = items[i];
                        if (item instanceof DiagramElement) {
                            item.select(true);
                            selected.push(item);
                        }
                    }
                }
                else if (itemsOrRect instanceof DiagramElement) {
                    itemsOrRect.select(true);
                    selected.push(itemsOrRect);
                }
                this.trigger(SELECT, {items: selected});
                this._internalSelection = false;
            }
            else {
                return this._selectedItems; // returns all selected items.
            }
        },
        /**
         * Brings to front the passed items.
         * @param items DiagramElement, Array of Items.
         * @param undoable. By default the action is undoable.
         */
        toFront: function (items, undoable) {
            var result = this._getDiagramItems(items), indices;
            if (Utils.isUndefined(undoable) || undoable) {
                indices = indicesOfItems(this.mainLayer.native, result.visuals);
                var unit = new ToFrontUnit(this, items, indices);
                this.undoRedoService.add(unit);
            }
            else {
                this.mainLayer.toFront(result.visuals);
                this._fixOrdering(result, true);
            }
        },
        /**
         * Sends to back the passed items.
         * @param items DiagramElement, Array of Items.
         * @param undoable. By default the action is undoable.
         */
        toBack: function (items, undoable) {
            var result = this._getDiagramItems(items), indices;
            if (Utils.isUndefined(undoable) || undoable) {
                indices = indicesOfItems(this.mainLayer.native, result.visuals);
                var unit = new ToBackUnit(this, items, indices);
                this.undoRedoService.add(unit);
            }
            else {
                this.mainLayer.toBack(result.visuals);
                this._fixOrdering(result, false);
            }
        },
        /**
         * Bring into view the passed item(s) or rectangle.
         * @param items DiagramElement, Array of Items, Rect.
         * @param options. align - controls the position of the calculated rectangle relative to the viewport.
         * "Center middle" will position the items in the center. animate - controls if the pan should be animated.
         */
        bringIntoView: function (item, options) { // jQuery|Item|Array|Rect
            var rect, viewport = this.viewport(), align, old, newPan, deltaPan;
            options = deepExtend({animate: false, align: "center middle"}, options);
            if (item instanceof DiagramElement) {
                rect = item.bounds("transformed");
            }
            else if (Utils.isArray(item)) {
                rect = this.getBoundingBox(item);
            }
            else if (item instanceof Rect) {
                rect = item.clone();
            }
            if (options.align !== "none" || !viewport.contains(rect.center())) {
                if (options.align === "none") {
                    options.align = "center middle";
                }
                old = rect.clone();
                align = new kendo.diagram.RectAlign(viewport);
                align.align(rect, options.align);
                deltaPan = old.topLeft().minus(rect.topLeft());
                newPan = this.pan().minus(deltaPan);
                if (options.animate) {
                    var t = new Ticker();
                    t.addAdapter(new PanAdapter({pan: newPan, diagram: this}));
                    t.play();
                } else {
                    this.pan(newPan);
                }
            }
        },
        alignShapes: function (direction) {
            if (Utils.isUndefined(direction)) {
                direction = "Left";
            }
            var items = this.select(),
                val,
                item,
                i;
            if (items.length === 0) {
                return;
            }
            switch (direction.toLowerCase()) {
                case "left":
                case "top":
                    val = Number.MAX_VALUE;
                    break;
                case "right":
                case "bottom":
                    val = Number.MIN_VALUE;
                    break;
            }
            for (i = 0; i < items.length; i++) {
                item = items[i];
                if (item instanceof Shape) {
                    switch (direction.toLowerCase()) {
                        case "left":
                            val = Math.min(val, item.options.x);
                            break;
                        case "top":
                            val = Math.min(val, item.options.y);
                            break;
                        case "right":
                            val = Math.max(val, item.options.x);
                            break;
                        case "bottom":
                            val = Math.max(val, item.options.y);
                            break;
                    }
                }
            }
            var undoStates = [];
            var shapes = [];
            for (i = 0; i < items.length; i++) {
                item = items[i];
                if (item instanceof Shape) {
                    shapes.push(item);
                    undoStates.push(item.bounds());
                    switch (direction.toLowerCase()) {
                        case "left":
                        case "right":
                            item.position(new Point(val, item.options.y));
                            break;
                        case "top":
                        case "bottom":
                            item.position(new Point(item.options.x, val));
                            break;
                    }
                    //item.refresh();
                }
            }
            var unit = new kendo.diagram.TransformUnit(shapes, undoStates);
            this.undoRedoService.add(unit, false);
        },
        zoom: function (zoom, staticPoint) {
            if (zoom) {
                var currentZoom = this._zoom;
                zoom = this._zoom = this._getValidZoom(zoom);

                if (!Utils.isUndefined(staticPoint)) {//Viewpoint vector is constant
                    var zoomedPoint = staticPoint.times(zoom);
                    var viewportVector = staticPoint.times(currentZoom).plus(this._pan);
                    this._storePan(viewportVector.minus(zoomedPoint));//pan + zoomed point = viewpoint vector
                }

                this._panTransform();
                this.trigger(ZOOM);
            }
            return this._zoom;
        },
        pan: function (pan, animated) {
            if (pan instanceof Point && !pan.equals(this._pan)) {
                this._storePan(pan);
                this._panTransform(pan, animated);

                this.trigger(PAN);
            }

            return this._pan;
        },
        viewport: function () {
            return this.canvas.bounds();
        },
        copy: function () {
            if (this.options.copy.enabled) {
                this._clipboard.clear();
                this._copyOffset = 1;
                for (var i = 0; i < this._selectedItems.length; i++) {
                    var item = this._selectedItems[i];
                    this._clipboard.push(item);
                }
            }
        },
        cut: function () {
            if (this.options.copy.enabled) {
                this._clipboard.clear();
                this._copyOffset = 0;
                for (var i = 0; i < this._selectedItems.length; i++) {
                    var item = this._selectedItems[i];
                    this._clipboard.push(item);
                }
                this.remove(this._clipboard);
            }
        },
        paste: function () {
            var offsetX, offsetY, item, copied, connector, shape, i;
            if (this._clipboard.length > 0) {
                var mapping = new Dictionary();

                offsetX = this._copyOffset * this.options.copy.offsetX;
                offsetY = this._copyOffset * this.options.copy.offsetY;
                this.select(false);
                // first the shapes
                for (i = 0; i < this._clipboard.length; i++) {
                    item = this._clipboard[i];
                    if (item instanceof Connection) {
                        continue;
                    }
                    copied = item.clone();
                    mapping.set(item.id, copied.id);
                    this._addItem(copied);
                    copied.position(new Point(item.options.x + offsetX, item.options.y + offsetY));
                    copied.select(true);
                }
                // then the connections
                for (i = 0; i < this._clipboard.length; i++) {
                    item = this._clipboard[i];
                    if (item instanceof Shape) {
                        continue;
                    }
                    copied = item.clone();
                    if (item.source() instanceof Connector) { // if Point then it's a floating end
                        connector = item.source();
                        if (mapping.containsKey(connector.shape.id)) { // occurs when an attached connection is pasted with unselected shape parents
                            shape = this.getId(mapping.get(connector.shape.id));
                            copied.source(shape.getConnector(connector.options.name));
                        } else {
                            copied.source(new Point(item.sourcePoint().x + offsetX, item.sourcePoint().y + offsetY));
                        }
                    }
                    if (item.target() instanceof Connector) {
                        connector = item.target();
                        if (mapping.containsKey(connector.shape.id)) {
                            shape = this.getId(mapping.get(connector.shape.id));
                            copied.target(shape.getConnector(connector.options.name));
                        }
                        else {
                            copied.target(new Point(item.targetPoint().x + offsetX, item.targetPoint().y + offsetY));
                        }
                    }
                    this._addItem(copied);
                    copied.position(new Point(item.options.x + offsetX, item.options.y + offsetY));
                    copied.select(true);
                }
                this._copyOffset += 1;

            }
        },
        // Miro: I would make that private and/or use toOrigin instead.
        documentToCanvasPoint: function (dPoint) {
            var scroll = this._pan;

            return this.documentToViewportPoint(dPoint).minus(scroll);
        },
        documentToViewportPoint: function (point) {
            var containerOffset = this.element.offset();

            return new Point(point.x - containerOffset.left, point.y - containerOffset.top);
        },
        /**
         * Gets the bounding rectangle of the given items.
         * @param items DiagramElement, Array of elements.
         * @param origin Boolean. Pass 'true' if you need to get the bounding box of the shapes without their rotation offset.
         * @returns {Rect}
         */
        getBoundingBox: function (items, origin) {
            var rect = Rect.empty(), temp,
                di = Utils.isDefined(items) ? this._getDiagramItems(items) : {shapes: this.shapes};
            if (di.shapes.length > 0) {
                var item = di.shapes[0];
                if (origin === true) {
                    rect.x -= item._rotationOffset.x;
                    rect.y -= item._rotationOffset.y;
                }
                rect = item.bounds("rotated");
                for (var i = 1; i < di.shapes.length; i++) {
                    item = di.shapes[i];
                    temp = item.bounds("rotated");
                    if (origin === true) {
                        temp.x -= item._rotationOffset.x;
                        temp.y -= item._rotationOffset.y;
                    }
                    rect = rect.union(temp);
                }
            }
            return rect;
        },
        /**
         * Transforms point or rect from main canvas coordinates to non-transformed (origin).
         * @param value Point, Rect.
         * @returns {Point, Rect}
         */
        toOrigin: function (value) {
            var result = value;
            if (value instanceof Point) {
                if (this._matrix) {
                    result = this._matrix.apply(value);
                }
            }
            else {
                var tl = this.toOrigin(value.topLeft()),
                    br = this.toOrigin(value.bottomRight());
                result = Rect.fromPoints(tl, br);
            }
            return result;
        },
        setDataSource: function (dataSource) {
            this.options.dataSource = dataSource;
            this._dataSource();
            if (this.options.autoBind) {
                this.dataSource.fetch();
            }
        },
        /**
         * Performs a diagram layout of the given type.
         * @param layoutType The layout algorithm to be applied (TreeLayout, LayeredLayout, SpringLayout).
         * @param options Layout-specific options.
         */
        layout: function (options) {
            this.isLayouting = true;
            // TODO: raise layout event?
            var type;
            if (Utils.isUndefined(options) || Utils.isUndefined(options.type)) {
                type = "Tree";
            }
            else {
                type = options.type;
            }
            var l;
            switch (type.toLowerCase()) {
                case "tree":
                    l = new diagram.TreeLayout(this);
                    break;

                case "layered":
                    l = new diagram.LayeredLayout(this);
                    break;

                case "forcedirected":
                case "force":
                case "spring":
                case "springembedder":
                    l = new diagram.SpringLayout(this);
                    break;
                default:
                    throw "Layout algorithm '" + type + "' is not supported.";
            }
            var initialState = new kendo.diagram.LayoutState(this);
            var finalState = l.layout(options);
            if (finalState) {
                var unit = new kendo.diagram.LayoutUndoUnit(initialState, finalState, options ? options.animate : null);
                this.undoRedoService.add(unit);
            }
            this.isLayouting = false;
        },
        findByUid: function (uid) {
            return this.element.find(".k-shape[" + kendo.attr("uid") + "=" + uid + "]");
        },
        /**
         * Gets a shape on the basis of its identifier.
         * @param id (string) the identifier of a shape.
         * @returns {Shape}
         */
        getId: function (id) {
            var found;
            found = this.shapes.first(function (s) {
                return s.visual.native.id === id;
            });
            if (found) {
                return found;
            }
            found = this.connections.first(function (c) {
                return c.visual.native.id === id;
            });
            return found;
        },
        _getValidZoom: function (zoom) {
            return Math.min(Math.max(zoom, 0.55), 2.0); //around 0.5 something exponential happens...!?
        },
        _panTransform: function (pos, animated) {
            var diagram = this,
                pan = pos || diagram._pan;

            if (this.scroller) {
                var scrollMethod = (animated === true ? "animatedScrollTo" : "scrollTo");

                diagram.scroller[scrollMethod](pan.x, pan.y);
                this._zoomMainLayer();
            }
            else {
                diagram._transformMainLayer();
            }
        },
        _storePan: function (pan) {
            this._pan = pan;
        },
        _zoomMainLayer: function () {
            var zoom = this._zoom;

            var transform = new CompositeTransform(0, 0, zoom, zoom);
            transform.render(this.mainLayer.native);
            this._matrix = transform.toMatrix();
        },
        _transformMainLayer: function () {
            var pan = this._pan,
                zoom = this._zoom;

            var transform = new CompositeTransform(pan.x, pan.y, zoom, zoom);
            transform.render(this.mainLayer.native);
            this._matrix = transform.toMatrix();
        },
        _toIndex: function (items, indices) {
            var result = this._getDiagramItems(items);
            this.mainLayer.toIndex(result.visuals, indices);
            this._fixOrdering(result, false);
        },
        _drop: function () {
            var that = this,
                options = that.options;
            if (options.dragAndDrop && kendo.ui.DropTarget) {
                this.element.kendoDropTarget({
                    drop: function (e) {
                        var item, pos, dp, normal;
                        if (e.draggable && e.draggable.hint) {
                            item = e.draggable.hint.data("data");
                            pos = e.draggable.hintOffset;
                            dp = that.documentToCanvasPoint(new Point(pos.left, pos.top));
                            normal = that._normalizePointZoom(dp.minus(that.pan()));

                            that.addShape(normal, item);
                        }
                    }
                });
            }
        },
        _fixOrdering: function (result, toFront) {
            var shapePos = toFront ? this.shapes.length - 1 : 0,
                conPos = toFront ? this.connections.length - 1 : 0,
                i, item;
            for (i = 0; i < result.shapes.length; i++) {
                item = result.shapes[i];
                this.shapes.remove(item);
                this.shapes.insert(item, shapePos);
            }
            for (i = 0; i < result.cons.length; i++) {
                item = result.cons[i];
                this.connections.remove(item);
                this.connections.insert(item, conPos);
            }
        },
        _getDiagramItems: function (items) {
            var i, result = {}, args = items;
            result.visuals = [];
            result.shapes = [];
            result.cons = [];
            if (!items) {
                args = this._selectedItems;
            }
            else if (!Utils.isArray(items)) {
                args = [items];
            }
            for (i = 0; i < args.length; i++) {
                var item = args[i];
                if (item instanceof Shape) {
                    result.shapes.push(item);
                    result.visuals.push(item.visual);
                }
                else if (item instanceof Connection) {
                    result.cons.push(item);
                    result.visuals.push(item.visual);
                }
            }
            return result;
        },
        _removeItem: function (item, undoable) {
            item.select(false);
            if (item instanceof Shape) {
                this._removeShape(item, undoable);
            }
            else if (item instanceof Connection) {
                this._removeConnection(item, undoable);
            }
            if (!undoable) {
                this.mainLayer.remove(item.visual);
            }
        },
        _removeShape: function (shape, undoable) {
            var i, connection, connector,
                sources = [], targets = [];
            this.toolService._removeHover();

            if (undoable) {
                this.undoRedoService.addCompositeItem(new DeleteShapeUnit(shape));
            }
            else {
                this.shapes.remove(shape);
            }
            for (i = 0; i < shape.connectors.length; i++) {
                connector = shape.connectors[i];
                for (var j = 0; j < connector.connections.length; j++) {
                    connection = connector.connections[j];
                    if (connection.sourceConnector == connector) {
                        sources.push(connection);
                    } else if (connection.targetConnector == connector) {
                        targets.push(connection);
                    }
                }
            }

            for (i = 0; i < sources.length; i++) {
                sources[i].source(null, undoable);
            }
            for (i = 0; i < targets.length; i++) {
                targets[i].target(null, undoable);
            }
        },
        _removeConnection: function (connection, undoable) {
            if (connection.sourceConnector) {
                connection.sourceConnector.connections.remove(connection);
            }
            if (connection.targetConnector) {
                connection.targetConnector.connections.remove(connection);
            }
            if (undoable) {
                this.undoRedoService.addCompositeItem(new DeleteConnectionUnit(connection));
            }
            else {
                this.connections.remove(connection);
            }
        },
        _refreshSource: function (e) {
            var that = this,
                node = e.node,
                action = e.action,
                items = e.items,
                options = that.options,
                i;

            function addShape(node) {
                if (Utils.isUndefined(node)) { // happens on updating dataSource
                    return;
                }
                var shape = that._dataMap.first(function (item) {
                    return item.uid === node.uid;
                });
                if (shape) {
                    return shape.shape;
                }

                var opt = {
                    data: options.visualTemplate,
                    template: options.template,
                    context: node
                };
                shape = new Shape(opt, node);
                that.addShape(shape);
                that._dataMap.push({uid: node.uid, shape: shape});
                return shape;
            }

            function append(parent, children) {
                for (var i = 0; i < children.length; i++) {
                    var node = children[i],
                        shape = addShape(node),
                        parentShape = addShape(parent);
                    if (parentShape && !that.connected(parentShape, shape)) { // check if connected to not duplicate connections.
                        var con = that.connect(parentShape, shape);
                        //var con = that.connect(parentShape.connectors[2], shape.connectors[0]);
                        con.type(CASCADING);
                    }
                }
            }

            if (!e.field) { // field means any field in the data source has changed - like selected, expanded... We don't have to update in that case.
                if (action === "add") {
                    append(node, items);
                } else if (action === "remove") {
                    //Remove
                } else if (action === "itemchange") {
                    if (node) {
                        if (!items.length) {
                            //Update
                        } else {
                            append(node, items);
                        }
                    } else {
                        for (i = 0; i < items.length; i++) {
                            addShape(items[i]); // roots
                        }
                    }
                }

                for (i = 0; i < items.length; i++) {
                    items[i].load();
                }
            }
        },
        _mouseDown: function (e) {
            var p = this._calculatePosition(e);
            if (e.button === 0 && this.toolService.start(p, this._meta(e))) {
                e.preventDefault();
            }
        },
        _addItem: function (item) {
            if (item instanceof Shape) {
                this.addShape(item);
            }
            else if (item instanceof Connection) {
                this.addConnection(item);
            }
        },
        _mouseUp: function (e) {
            var p = this._calculatePosition(e);
            if (e.button === 0 && this.toolService.end(p, this._meta(e))) {
                e.preventDefault();
            }
        },
        _mouseMove: function (e) {
            var p = this._calculatePosition(e);
            if (e.button === 0 && this.toolService.move(p, this._meta(e))) {
                e.preventDefault();
            }
        },
        _doubleClick: function (e) {
            var p = this._calculatePosition(e);
            if (e.button === 0 && this.toolService.doubleClick(p, this._meta(e))) {
                e.preventDefault();
            }
        },
        _keydown: function (e) {
            if (this.toolService.keyDown(e.keyCode, this._meta(e))) {
                e.preventDefault();
            }
        },
        _wheel: function (e) {
            var p = this._calculatePosition(e),
                meta = deepExtend(this._meta(e), { delta: e.data.delta });

            if (this.toolService.wheel(p, meta)) {
                e.preventDefault();
            }
        },
        _meta: function (e) {
            return { ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey };
        },
        _calculatePosition: function (e) {
            var pointEvent = (e.pageX === undefined ? e.originalEvent : e),
                point = new Point(pointEvent.pageX, pointEvent.pageY),
                offset = this.documentToCanvasPoint(point);

            return this._normalizePointZoom(offset);
        },
        _normalizePointZoom: function (point) {
            return point.times(1 / this.zoom());
        },
        _initialize: function () {
            this._zoom = 1.0;
            this._pan = new Point();
            this.shapes = [];
            this._selectedItems = [];
            this.connections = [];
            this._adorners = [];
            this._dataMap = [];
            this.undoRedoService = new UndoRedoService();
            this.id = kendo.diagram.randomId();
        },
        _attachEvents: function () {
            var diagram = this;

            diagram.bind(BOUNDSCHANGE, $.proxy(this._autosizeCanvas, this));
            diagram.bind(ITEMSCHANGE, $.proxy(this._autosizeCanvas, this));
            diagram.bind(ZOOM, $.proxy(this._autosizeCanvas, this));
        },
        _fetchFreshData: function () {
            this._dataSource();
            if (this.options.autoBind) {
                this.dataSource.fetch();
            }
        },
        _dataSource: function () {
            var that = this,
                options = that.options,
                dataSource = options.dataSource;

            dataSource = Utils.isArray(dataSource) ? { data: dataSource } : dataSource;

            if (!dataSource.fields) {
                dataSource.fields = [
                    { field: "text" },
                    { field: "url" },
                    { field: "spriteCssClass" },
                    { field: "imageUrl" }
                ];
            }
            if (that.dataSource && that._refreshHandler) {
                that._unbindDataSource();
            }

            that._refreshHandler = proxy(that._refreshSource, that);
            that._errorHandler = proxy(that._error, that);

            that.dataSource = HierarchicalDataSource.create(dataSource)
                .bind(CHANGE, that._refreshHandler)
                .bind(ERROR, that._errorHandler);
        },
        _unbindDataSource: function () {
            var that = this;

            that.dataSource.unbind(CHANGE, that._refreshHandler).unbind(ERROR, that._errorHandler);
        },
        _error: function () {
            // TODO: Do something?
        },
        _adorn: function (adorner, isActive) {
            if (isActive !== undefined && adorner) {
                if (isActive) {
                    this._adorners.push(adorner);
                    this.adornerLayer.append(adorner.visual);
                }
                else {
                    this._adorners.remove(adorner);
                    this.adornerLayer.remove(adorner.visual);
                }
            }
        },
        _showConnectors: function (shape, value) {
            if (value) {
                this._connectorsAdorner.show(shape);
            } else {
                this._connectorsAdorner.destroy();
            }
        },
        _autosizeCanvas: function (args) {
            var diagram = args.sender || this,
                zoom = diagram.zoom(),
                viewport = diagram.element,
                viewportSize = new Rect(0, 0, viewport.width(), viewport.height()),
                cumulativeSize = diagram.getBoundingBox(diagram.shapes);

            cumulativeSize.width = (cumulativeSize.width + cumulativeSize.x) * zoom;
            cumulativeSize.height = (cumulativeSize.height + cumulativeSize.y) * zoom;

            cumulativeSize = cumulativeSize.union(viewportSize);

            diagram.canvas.size(cumulativeSize);
        },

        _raiseItemsAdded: function(items) {
            this._raiseItemsChanged({added: items});
        },
        _raiseItemsRemoved: function(items) {
            this._raiseItemsChanged({removed: items});
        },
        _raiseItemsChanged: function(collections) {
            this.trigger(ITEMSCHANGE, collections);
        },

        _refresh: function () {
            var i;
            for (i = 0; i < this.connections.length; i++) {
                this.connections[i].refresh();
            }
        }
    });

    ui.plugin(Diagram);

    kendo.deepExtend(diagram, {
        Shape: Shape,
        Connection: Connection,
        Connector: Connector
    });
})(window.kendo.jQuery);