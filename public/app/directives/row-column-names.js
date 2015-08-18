function ctrl($scope){
	$scope.editable = "Edit"
}

angular.module('grafana.directives').directive('contenteditable', function(){
	return{
		require: '?ngModel',
		link: function(scope, elm, attrs, ctrl) {
      	// view -> model
      	elm.bind('blur', function() {
      		scope.$apply(function() {
            if (scope.row[0] == undefined){
              scope.panel.columnNames[scope.column[0]] = elm.html()
            }else{
              scope.panel.rowNames[scope.row[0]] = elm.html()
            }

          });
      	});

      }
    };
  });

