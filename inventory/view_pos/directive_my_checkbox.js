angular.module('myApp')

.directive('myCheckbox', function($modal, $http, $timeout) {
  return {
    restrict: 'AE',
    scope: {
      value: '=',
      isToggle: '=?',
      callback: '&'
    },
    templateUrl: './view_pos/template_my_checkbox.html',
    link: function(scope, elem, attrs) {

      scope.clicked = function() {
        if (scope.isToggle===true) {
          scope.value = !scope.value;
        } else {
          scope.value = true;
        }
        //console.log(scope.value);
        $timeout((function() {
          if (scope.callback!==undefined && scope.callback!==null) {
            scope.callback();
          }
        }), 0);
      };

    }
  }
});