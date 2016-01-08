angular.module('myApp')

.directive('searchClickBox', function($modal) {
  return {
    restrict: 'AE',
    scope: {
      control: '=',
      minLength: '=?',
      queryPlaceholder: '=?',
      onSearch: '&',
      onClear: '&'
    },
    templateUrl: './view_pos/template_search_click_box.html',
    link: function(scope, elem, attrs) {

      scope.internalControl = scope.control || {};

      scope.search_query = {'query':null, 'active':false};

      if (scope.minLength===undefined || scope.minLength===null ) {
        scope.minLength = 0;
      }
      if (scope.placeholder===undefined || scope.placeholder===null) {
        scope.placeholder = '';
      }

      scope.internalControl.clearSearchQuery = function() {
        scope.search_query['query'] = null;
        scope.search_query['active'] = false;
      }
      scope.internalControl.clearSearchQuery();

      scope.internalControl.activate = function() {
        scope.search_query.active = true;
      }

      scope.internalControl.deactivate = function() {
        scope.search_query.active = false;
      }

      scope.clickedSearch = function() {
        if (scope.onSearch !== null) {
          scope.onSearch({query:scope.search_query.query});
        }
      }

      scope.clickedClear = function() {
        scope.internalControl.clearSearchQuery();
        if (scope.onClear !== null) {
          scope.onClear();
        }
      }

    }
  }
});