define([
  'angular',
  'app',
  'lodash',
  'components/timeSeries',
  'kbn',
  'components/panelmeta',
  './pieChartPanel',
  ],
  function (angular, app, _, TimeSeries, kbn, PanelMeta) {
    'use strict';

    var module = angular.module('grafana.panels.piechart');
    app.useModule(module);

    module.directive('grafanaPanelPiechart', function() {
      return {
        controller: 'PieChartCtrl',
        templateUrl: 'app/panels/piechart/module.html'
      };
    });

    module.controller('PieChartCtrl', function($scope, $rootScope, panelSrv, timeSrv, panelHelper) {
      $scope.panelMeta = new PanelMeta({
        description: 'Pie chart panel',
        fullscreen: true,
        metricsEditor: true
      });

      $scope.panelMeta.addEditorTab('Options', 'app/panels/piechart/editor.html');

    // Set and populate defaults
    var _d = {
      pieType: 'pie',
      legend: { show: false },
      targets: [{}],
      cacheTimeout: null,
      interval: null,
      maxDataPoints: 3

    };

    _.defaults($scope.panel, _d);

    $scope.init = function() {
      panelSrv.init($scope);
      $scope.$on('refresh', $scope.get_data);

    };

    $scope.updateTimeRange = function () {
      $scope.range = timeSrv.timeRange();
      $scope.rangeUnparsed = timeSrv.timeRange(false);
      $scope.resolution = $scope.panel.maxDataPoints;
      $scope.interval = kbn.calculateInterval($scope.range, $scope.resolution, $scope.panel.interval);
    };

    $scope.get_data = function() {
      $scope.updateTimeRange();

      var metricsQuery = {
        range: $scope.rangeUnparsed,
        interval: $scope.interval,
        targets: $scope.panel.targets,
        maxDataPoints: $scope.resolution,
        cacheTimeout: $scope.panel.cacheTimeout
      };

      return $scope.datasource.query(metricsQuery)
      .then($scope.dataHandler)
      .then(null, function(err) {
        console.log("err");
        $scope.panelMeta.loading = false;
        $scope.panelMeta.error = err.message || "Timeseries data request error";
        $scope.inspector.error = err;
        $scope.render();
      });
    };

    $scope.refreshData = function(datasource) {
      panelHelper.updateTimeRange($scope);

      return panelHelper.issueMetricQuery($scope, datasource)
      .then($scope.dataHandler, function(err) {
        $scope.series = [];
        $scope.render();
        throw err;
      });
    };

    $scope.dataHandler = function(results) {
      $scope.panelMeta.loading = false;
      $scope.series = _.map(results.data, $scope.seriesHandler);
      $scope.render();
    };

    $scope.seriesHandler = function(seriesData) {
      var series = new TimeSeries({
        datapoints: seriesData.datapoints,
        alias: seriesData.target,
      });

      series.flotpairs = series.getFlotPairs('connected');

      return series;
    };

    $scope.render = function() {
      var data = [];

      if ($scope.series && $scope.series.length > 0) {
        for (var i=0; i < $scope.series.length; i++) {
          data.push({label: $scope.series[i].alias, data: $scope.series[i].stats.current, color: $rootScope.colors[i]});
        }
      }

      $scope.data = data;
      $scope.$emit('render');
    };

    $scope.init();
  });
});