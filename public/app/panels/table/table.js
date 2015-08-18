  define([
    'angular',
    'jquery',
    'lodash',
    'moment',
    ],
    function (angular, $, _, moment) {
      'use strict';
      var module = angular.module('grafana.directives');


      module.directive('grafanaTable', function($rootScope, $timeout, $sce) {
        var SortType = {
          none: 0,
          asc: 1,
          desc: 2
        };
        return {
          restrict: 'A',
          templateUrl: 'app/panels/table/table.html',
          link: function(scope, elem) {
            var data;
            var sortedData; // will shadow the data

            // paging variables
            var dataToSkip;
            var pagedData;
            var minPage;

            var tableHeight;

            scope.sortType = SortType;

            // refers to the actual physical column order of the table
            scope.columnOrder = [];

            // refers to the order in which the columns were requested to be sorted
            // for example, we might want to first sort by second column, then by third, then by first, etc.
            // this does not necessarily refer to the physical order of the columns
            scope.panel.columnSortOrder = [];
            if (scope.panel.numberOfRows == undefined){
              scope.panel.numberOfRows = 0
              scope.panel.numberOfColumns = 0
            }

            scope.$on('render',function(event, renderData) {
              data = renderData || data;
              if (!data) {
                scope.get_data();
                return;
              }
              scope.columnOrder = data.columnOrder;
              sortedData = [].concat(data.values); // on initial render, original data is the desired sort
              
              renderTable();
            });

            // if user changes page
            scope.$watch('panel.curTablePage', function() {
              scope.panel.curTablePage = parseInt(scope.panel.curTablePage) || 1; // ensure page is numeric

              if (scope.panel.curTablePage < minPage) {
                scope.panel.curTablePage = minPage;
              }

              if (scope.panel.curTablePage > scope.panel.numPages) {
                scope.panel.curTablePage = scope.panel.numPages;
              }

              if (!data) {
                return;
              }

              renderTable();
            });



            scope.updateRows = function() {
              if (scope.panel.rows != undefined){
                if (scope.panel.numberOfRows >= scope.panel.rows.length){
                  for(var i = 0; i < (scope.panel.numberOfRows - scope.panel.rows.length); i++) {
                    scope.panel.rows.push([scope.panel.rows.length + i]);
                    scope.panel.rowNames.push('Edit')
                  }
                }else{
                  for(var i = 0; i < (scope.panel.rows.length - scope.panel.numberOfRows); i++) {
                    scope.panel.rows.pop();
                    scope.panel.rowNames.pop();
                  }
                }
              }else{
                scope.panel.rows = []
                scope.panel.rowNames = []
                for(var i = 0; i < scope.panel.numberOfRows; i++) {
                  scope.panel.rows.push([i]);
                  scope.panel.rowNames.push('Edit')
                }
              }
              //scope.panel.rowLength = scope.panel.rows.length
            }

            scope.updateColumns = function() {
              if(scope.panel.columns != undefined){
                if (scope.panel.numberOfColumns >= scope.panel.columns.length -1){
                  for(var i = 0; i < (scope.panel.numberOfColumns - scope.panel.columns.length + 1); i++) {
                    scope.panel.columns.push([scope.panel.columns.length + i]);
                    scope.panel.columnNames.push('Edit');
                  }
                }else{
                  for(var i = 0; i < (scope.panel.columns.length - scope.panel.numberOfColumns); i++) {
                    scope.panel.columns.pop();
                    scope.panel.columnNames.pop();
                  }
                }
              }else{
                scope.panel.columns = []
                scope.panel.columnNames = []
                for(var i = 0; i <= scope.panel.numberOfColumns; i++) {
                  scope.panel.columns.push([i]);
                  scope.panel.columnNames.push('Edit');
                }
              }
              //scope.panel.columnLength = scope.panel.columns.length - 1 
            }


            scope.updateColumnName = function(idx){
              scope.panel.columnNames[idx[0]] = scope.columnName
            }

            scope.updateRowName = function(idx){
              scope.panel.rowNames[idx[0]] = scope.rowName
            }

            scope.panel.clearSortOrder = function() {
              _.each(scope.headers, function(column) {
                column.sortType = SortType.none;
              });

              scope.panel.columnSortOrder = [];
              sortedData = [].concat(data.values); // set sorted data to initial data state
              renderTable();
            };

            scope.panel.adjustColumnWidth = function() {
              performHeaderPositioning();
            };

            function renderTable() {
              var isHeightSet = setTableHeightVariable();
              if (shouldAbortRender(isHeightSet)) {
                return;
              }

              setTableData();

              elem.find('.table-vis-overflow-container').height(tableHeight);
              elem.height(tableHeight); // set physical height of directive

              $timeout(function() { // after angular is processing, do jquery stuff
                performHeaderPositioning();
              }, 0);
            }

            // on resize or scroll, the absolutely positioned headers will be shifted, during shift we reposition them
            $(window).resize(function() {
              performHeaderPositioning();
            });

            elem.find('.table-vis-overflow-container').scroll(function() {
              performHeaderPositioning();
            });

            

            function setTableData() {
              // avoid using angular bindings for table data in order to avoid performance penalty
              // in case user wants to view a large number of cells simultaneously

              var html = ''
              
              if (data.values.length > 0){
                scope.time = moment(data.values[data.values.length - 1 ].Time).format('L HH:mm:ss')
                scope.metricValues = []
                
                var total = {} 
                for (var i=1; i< scope.panel.columns.length; ++i){
                  total[i] = 0
                }
                
                //iterates through data in alphabetical order, retrieving the most recent value
                _.forIn(data.values[data.values.length - 1 ], function(value,key){
                  if (key != 'Time'){
                    scope.metricValues.push({metric: key, value: value})

                    //need to extract metric name if it has a tag
                    var metric_name = key.split("{")[0]

                    var tagData = []

                    
                    //iterates through metrics in panels to find a match between the retrived data and the metric
                    for (var i=0; i < scope.panel.targets.length; ++i){

                      var metricName = scope.panel.targets[i].metric;
                      tagData = []
                      if (!_.isEmpty(scope.panel.targets[i].tags)) {
                        _.each(_.pairs(scope.panel.targets[i].tags), function(tag) {
                          tagData.push(tag[0] + "=" + tag[1]);

                        });
                      }

                      if (!_.isEmpty(tagData)) {
                        metricName += "{" + tagData.join(", ") + "}";
                      }
                      
                      //if the metric names equal and if a row and column for the metric is defined, add the html
                      if (scope.panel.targets[i].row != undefined && scope.panel.targets[i].column != undefined && metricName == key ){
                        
                        var colorStyle = getCellColorStyle(value, i);
                        html += '<div ng-if="column == ' + scope.panel.targets[i].column + ' && row == ' + (scope.panel.targets[i].row-1) + '" ' + colorStyle.textAndBackground + ' title="' + key +  "\n" + scope.time +  '" align="center"' +'>' + value  + '</div>'
                        total[scope.panel.targets[i].column] += value
                      }
                    }
                  }
                });
}

              //Total of each column
              var totalHtml = ""
              for (var i=1; i<scope.panel.columns.length; ++i){
                totalHtml += '<div ng-if="column == ' + i + '">' + total[i] + '</div>'
              }
              scope.tableData = html;
              scope.total = totalHtml;


            }

            function performHeaderPositioning() {
              function applyAutoMaxWidth(el$) {
                el$.css({maxWidth: ''});
              }

              function applySpecifiedMaxWidth(el$) {
                el$.css({maxWidth: scope.panel.columnWidth + 'px'});
              }

              var container = elem.find('.table-vis-overflow-container');
              var yOffset = container.scrollTop();
              var fixedHeaders = elem.find('.fixed-table-header');
              var tds = container.find('td');

              // set width according to option specification
              if (scope.panel.columnWidth === 'auto') {
                applyAutoMaxWidth(fixedHeaders);
                applyAutoMaxWidth(tds);
              }
              else {
                applySpecifiedMaxWidth(fixedHeaders);
                applySpecifiedMaxWidth(tds);
              }

              for (var i = 0; i < fixedHeaders.length; ++i) {
                var fixedEl = fixedHeaders.eq(i);

                var borderOffset = - parseFloat(fixedEl.css('borderWidth')) || 0;
                fixedEl.css({ top: yOffset + borderOffset });
              }

              fixedHeaders.show();
            }



            function handleSorting() {
              var columnNamesToSort = [];
              var sortOrders = [];

              for (var i = 0; i < scope.panel.columnSortOrder.length; ++i) {
                var columnToSort = scope.panel.columnSortOrder[i]; // take from list of column sort priority
                var sortType = columnToSort.sortType;

                if (sortType !== SortType.none) {
                  columnNamesToSort.push(columnToSort.columnName);
                  sortOrders.push(columnToSort.sortType === SortType.asc ? true : false);
                }
              }

              sortedData = _.sortByOrder(data.values, columnNamesToSort, sortOrders);
            }


            function getCellColorStyle(value, columnIndex) {
              function getColorForValue(value) {
                for (var i = coloring.thresholdValues.length - 1; i >= 0; i--) {
                  if (value >= coloring.thresholdValues[i]) {
                    return coloring.colors[i];
                  }
                }

                return null;
              }

              var colorHtml = { textAndBackground: '', textOnly: '' };
              var backgroundHtml = '';
              var textHtml = '';

              var targetIndex = columnIndex;

              if (scope.panel.targets.length === 0 || targetIndex < 0 || !scope.panel.targets[targetIndex] || value === null) {
                return colorHtml;
              }

              var coloring = scope.panel.targets[targetIndex].coloring;

              if (coloring && (coloring.colorBackground || coloring.colorValue) && !isNaN(value)) {
                var color = getColorForValue(value);
                if (color) {
                  if (coloring.colorValue) {
                    textHtml = 'color:' + color + ';';
                  }
                  if (coloring.colorBackground) {
                    backgroundHtml = 'background-color:' + color + ';';
                  }
                }
              }

              colorHtml.textAndBackground = backgroundHtml || textHtml ? 'style="' + backgroundHtml + textHtml + ';"' : '';
              colorHtml.textOnly = textHtml ? 'style="' + textHtml + ';"' : '';
              return colorHtml;
            }

            function getFormattedValue(value, columnIndex) {
              if (columnIndex === 0) { // reference column
                if (scope.panel.inTimeSeriesMode && scope.panel.showTimeAsDate) { // if timeseries table and checkbox selected
                  //return moment(value).format('L HH:mm:ss');
                  return value
                }

                return value;
              }

              var decimalLimit = scope.panel.decimalLimit;
              if (value !== null && !isNaN(value) && decimalLimit !== null && !isNaN(decimalLimit)) {
                return value.toFixed(decimalLimit);
              }

              return value;
            }

            function getHyperlinkedTd(formattedValue, colorStyle, referenceTag) {
              if (!scope.panel.allowScriptedRagLink || !scope.panel.scriptedRagLink) {
                return formattedValue;
              }

              return '<a target="_new"' + colorStyle.textOnly + ' href="' +
              scope.panel.scriptedRagLink.replace('$tagName', referenceTag) + '">' + formattedValue +
              '</a>';

            }

            function shouldAbortRender(isHeightSet) {
              if (!data) {
                return true;
              }

              if ($rootScope.fullscreen && !scope.fullscreen) {
                return true;
              }

              if (!isHeightSet) { return true; }

              if (elem.width() === 0) {
                return false;
              }
            }

            function setTableHeightVariable() {
              var docHeight = $(window).height();
              var editscreenHeight = Math.floor(docHeight * 0.6);
              var fullscreenHeight = Math.floor(docHeight * 0.7);

              // editing takes up a lot of space, so it should be set accordingly
              if (scope.editMode) {
                scope.height = editscreenHeight;
              }
              else if (scope.fullscreen) {
                scope.height = fullscreenHeight;
              }
              else {
                scope.height = null; // if in normal dashboard mode
              }

              try {
                tableHeight = scope.height || scope.panel.height || scope.row.height;
                if (_.isString(tableHeight)) {
                  tableHeight = parseInt(tableHeight.replace('px', ''), 10);
                }

                tableHeight -= 5; // padding
                tableHeight -= scope.panel.title ? 24 : 9; // subtract panel title bar
                tableHeight -= scope.shouldHidePaginationControl() ? 0 : 57; // subtract paginator height/margin if applicable

                return true;
              } catch(e) { // IE throws errors sometimes
                return false;
              }
            }
          }
        };
      });
});
