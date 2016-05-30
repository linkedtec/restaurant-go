angular.module('myApp')

.directive('editInput', function($modal, $http, $timeout) {

  // This is an input field which shows "commit" and "revert" buttons when its content changes

  return {
    restrict: 'AE',
    scope: {
      value: '=',
      label: '=',
      placeholder: '=?',
      optional: '=?',
      bold: '=?',
      callerSave: '&',
      callerValidate: '&',
      control: '=',
      maxWidth: '=?'
    },
    templateUrl: './view_profile/template_edit_input.html',
    link: function(scope, elem, attrs) {

      scope.value_edit = scope.value;
      scope.form_ver = {error: false};
      scope.widthStyle = {};
      scope.boldStyle = {};

      if (scope.maxWidth !== undefined && scope.maxWidth !== null) {
        scope.widthStyle = { maxWidth: scope.maxWidth };
      }
      if (scope.bold !== undefined && scope.bold === true) {
        scope.boldStyle = { fontWeight: "bold" };
      }

      scope.revert = function() {
        scope.value_edit = scope.value;
        scope.form_ver['error'] = false;
      };

      scope.trySave = function() {

        scope.form_ver['error'] = false;

        var validated = scope.callerValidate({value: scope.value_edit});

        if (validated !== true) {
          scope.form_ver['error'] = true;
          return;
        }

        scope.callerSave({new_value: scope.value_edit});
      }

    }
  }
});