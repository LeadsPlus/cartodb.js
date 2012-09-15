/**
* leaflet implementation of a map
*/
(function() {
if(typeof(L) != "undefined") {

  var PlainLayer = L.TileLayer.extend({

    initialize: function (options) {
        L.Util.setOptions(this, options);
    },

    _redrawTile: function (tile) {
      tile.style['background-color'] = this.options.color;
    },

    _createTileProto: function () {
        var proto = this._divProto = L.DomUtil.create('div', 'leaflet-tile leaflet-tile-loaded');
        var tileSize = this.options.tileSize;
        proto.style.width = tileSize + 'px';
        proto.style.height = tileSize + 'px';

    },

    _loadTile: function (tile, tilePoint, zoom) {
    },

    _createTile: function () {
        var tile = this._divProto.cloneNode(false);
        //set options here
        tile.onselectstart = tile.onmousemove = L.Util.falseFn;
        this._redrawTile(tile);
        return tile;
    }

  });

  /**
  * base layer for all leaflet layers
  */
  var LeafLetLayerView = function(layerModel, leafletLayer, leafletMap) {
    this.leafletLayer = leafletLayer;
    this.leafletMap = leafletMap;
    this.model = layerModel;
    this.model.bind('change', this._update, this);
  };

  _.extend(LeafLetLayerView.prototype, Backbone.Events);
  _.extend(LeafLetLayerView.prototype, {

    /**
    * remove layer from the map and unbind events
    */
    remove: function() {
      this.leafletMap.removeLayer(this.leafletLayer);
      this.model.unbind(null, null, this);
      this.unbind();
    }

  });

  // -- plain layer view
  var LeafLetPlainLayerView = function(layerModel, leafletMap) {
    var leafletLayer = new PlainLayer(layerModel.attributes);
    LeafLetLayerView.call(this, layerModel, leafletLayer, leafletMap);
  };
  _.extend(LeafLetPlainLayerView.prototype, LeafLetLayerView.prototype, {
    _update: function() {
    }
  });
  cdb.geo.LeafLetPlainLayerView = LeafLetPlainLayerView;

  // -- tiled layer view

  var LeafLetTiledLayerView = function(layerModel, leafletMap) {
    var leafletLayer = new L.TileLayer(layerModel.get('urlTemplate'), {
      tms: layerModel.get('tms')
    });
    LeafLetLayerView.call(this, layerModel, leafletLayer, leafletMap);
  };

  _.extend(LeafLetTiledLayerView.prototype, LeafLetLayerView.prototype, {
    _update: function() {
      _.defaults(this.leafletLayer.options, _.clone(this.model.attributes));
      this.leafletLayer.setUrl(this.model.get('urlTemplate'));
    }
  });

  cdb.geo.LeafLetTiledLayerView = LeafLetTiledLayerView;

  /**
  * leatlet cartodb layer
  */

  var LeafLetLayerCartoDBView = function(layerModel, leafletMap) {
    var self = this;

    _.bindAll(this, 'featureOut', 'featureOver', 'featureClick');

    var opts = _.clone(layerModel.attributes);

    opts.map =  leafletMap;

    var // preserve the user's callbacks
    _featureOver  = opts.featureOver,
    _featureOut   = opts.featureOut,
    _featureClick = opts.featureClick;

    opts.featureOver  = function() {
      _featureOver  && _featureOver.apply(this, arguments);
      self.featureOver  && self.featureOver.apply(this, arguments);
    };

    opts.featureOut  = function() {
      _featureOut  && _featureOut.apply(this, arguments);
      self.featureOut  && self.featureOut.apply(this, arguments);
    };

    opts.featureClick  = function() {
      _featureClick  && _featureClick.apply(this, arguments);
      self.featureClick  && self.featureClick.apply(opts, arguments);
    };

    leafletLayer = new L.CartoDBLayer(opts);
    LeafLetLayerView.call(this, layerModel, leafletLayer, leafletMap);
  };


  _.extend(LeafLetLayerCartoDBView.prototype, LeafLetLayerView.prototype, {

    _update: function() {
      this.leafletLayer.setOptions(_.clone(this.model.attributes));
    },

    featureOver: function(e, latlon, pixelPos, data) {
      // dont pass leaflet lat/lon
      this.trigger('featureOver', e, [latlon.lat, latlon.lng], pixelPos, data);
    },

    featureOut: function(e) {
      this.trigger('featureOut', e);
    },

    featureClick: function(e, latlon, pixelPos, data) {
      // dont pass leaflet lat/lon
      this.trigger('featureClick', e, [latlon.lat, latlon.lng], pixelPos, data);
    }

  });

  cdb.geo.LeafLetLayerCartoDBView = LeafLetLayerCartoDBView;

  /**
  * leatlef impl
  */
  cdb.geo.LeafletMapView = cdb.geo.MapView.extend({

    layerTypeMap: {
      "tiled": cdb.geo.LeafLetTiledLayerView,
      "cartodb": cdb.geo.LeafLetLayerCartoDBView,
      "plain": cdb.geo.LeafLetPlainLayerView,
      // for google maps create a plain layer
      "gmapsbase": cdb.geo.LeafLetPlainLayerView
    },

    initialize: function() {

      _.bindAll(this, '_addLayer', '_removeLayer', '_setZoom', '_setCenter', '_setView');

      cdb.geo.MapView.prototype.initialize.call(this);

      var self = this;

      var center = this.map.get('center');

      var mapConfig = {
        zoomControl: false,
        center: new L.LatLng(center[0], center[1]),
        zoom: this.map.get('zoom'),
        minZoom: this.map.get('minZoom'),
        maxZoom: this.map.get('maxZoom')
      };
      if (this.map.get('bounding_box_ne')) {
        //mapConfig.maxBounds = [this.map.get('bounding_box_ne'), this.map.get('bounding_box_sw')];
      }

      this.map_leaflet = new L.Map(this.el, mapConfig);

      this.map.bind('set_view', this._setView, this);
      this.map.layers.bind('add', this._addLayer, this);
      this.map.layers.bind('remove', this._removeLayer, this);
      this.map.layers.bind('reset', this._addLayers, this);

      this._bindModel();

      this._addLayers();

      this.map_leaflet.on('layeradd', function(lyr) {
        this.trigger('layeradd', lyr, self);
      }, this);

      this.map_leaflet.on('zoomstart', function() {
        self.trigger('zoomstart');
      });

      this.map_leaflet.on('click', function() {
        self.trigger('click');
      });

      this.map_leaflet.on('zoomend', function() {
        self._setModelProperty({
          zoom: self.map_leaflet.getZoom()
        });
        self.trigger('zoomend');
      }, this);

      this.map_leaflet.on('move', function() {
        var c = self.map_leaflet.getCenter();
        self._setModelProperty({ center: [c.lat, c.lng] });
      });

      this.map_leaflet.on('drag', function() {
        var c = self.map_leaflet.getCenter();
        self._setModelProperty({
          center: [c.lat, c.lng]
        });
        self.trigger('drag');
      }, this);

    },



    _setZoom: function(model, z) {
      this.map_leaflet.setZoom(z);
    },

    _setCenter: function(model, center) {
      this.map_leaflet.panTo(new L.LatLng(center[0], center[1]));
    },

    _setView: function() {
      this.map_leaflet.setView(this.map.get("center"), this.map.get("zoom"));
    },

    _addLayer: function(layer, layers, opts) {
      var lyr, layer_view;

      var layerClass = this.layerTypeMap[layer.get('type').toLowerCase()];

      if (layerClass) {
        layer_view = new layerClass(layer, this.map_leaflet);
      } else {
        cdb.log.error("MAP: " + layer.get('type') + " can't be created");
        return;
      }

      this.layers[layer.cid] = layer_view;

      if (layer_view) {
        var isBaseLayer = this.layers.length === 1 || (opts && opts.index === 0);
        this.map_leaflet.addLayer(layer_view.leafletLayer, isBaseLayer);
        this.trigger('newLayerView', layer_view, this);
      } else {
        cdb.log.error("layer type not supported");
      }
    },

    latLonToPixel: function(latlon) {
      var point = this.map_leaflet.latLngToLayerPoint(new L.LatLng(latlon[0], latlon[1]));
      return this.map_leaflet.layerPointToContainerPoint(point);
    },

    // return the current bounds of the map view
    getBounds: function() {
      var b = this.map_leaflet.getBounds();
      var sw = b.getSouthWest();
      var ne = b.getNorthEast();
      return [
        [sw.lat, sw.lng],
        [ne.lat, ne.lng]
      ];
    },

    showBounds: function(bounds) {
      var sw = bounds[0];
      var ne = bounds[1];
      var southWest = new L.LatLng(sw[0], sw[1]);
      var northEast = new L.LatLng(ne[0], ne[1]);
      this.map_leaflet.fitBounds(new L.LatLngBounds(southWest, northEast));
    },

    getSize: function() {
      return this.map_leaflet.getSize();
    },

    panBy: function(p) {
      this.map_leaflet.panBy(new L.Point(p.x, p.y));
    }

  });

} // defined leaflet
})();
