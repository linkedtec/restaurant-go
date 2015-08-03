angular.module('myApp')

.directive('editLocation', function($modal, $http) {
  return {
    restrict: 'AE',
    scope: {
      allLocations: '=',
      locType: '=',
      editLoc: '=',
      closeOnDelete: '&',
      control: '='
    },
    templateUrl: './view_loc/template_edit_location.html',
    link: function(scope, elem, attrs) {

      // provides a way of exposing certain functions to outside controllers
      scope.internalControl = scope.control || {};

      scope.internalControl.clearForm = function() {
        scope.new_name = scope.editLoc.name;
        scope.new_failure_msg = null;
        scope.form_ver = {};
        scope.form_ver.error_name = false;
      };
      scope.internalControl.clearForm();

      scope.saveNewName = function() {
        
        if (scope.new_name === scope.editLoc.name) {
          return;
        }

        scope.new_failure_msg = null;
        scope.form_ver = {};
        scope.form_ver.error_name = false;

        // check if it's empty
        if (scope.new_name == null || scope.new_name == '')
        {
          scope.new_failure_msg = "Empty name!  Please enter a location name.";
          scope.form_ver.error_name = true;
          return;
        }
        // check if location is already in scope.locations
        for (var i in scope.allLocations) {
          var existing = scope.allLocations[i];
          if (existing.name === scope.new_name)
          {
            scope.new_failure_msg = "The location name " + scope.new_name + " already exists!";
            scope.form_ver.error_name = true;
            return;
          }
        }

        // loc put accepts name (old name), type (bev, kegs, etc), and new_name
        $http.put('/loc', {
          name:scope.editLoc.name,
          type:scope.locType,
          new_name:scope.new_name
        }).
        success(function(data, status, headers, config) {

          scope.editLoc.name = scope.new_name;

        }).
        error(function(data, status, headers, config) {
        });
      };

      scope.deleteLoc = function() {
        swal({
          title: "Delete this Location?",
          text: "This will remove " + scope.editLoc.name + " and all its inventory data, and cannot be undone.",
          type: "warning",
          showCancelButton: true,
          confirmButtonColor: "#DD6B55",
          confirmButtonText: "Yes, remove it!",
          closeOnConfirm: true },
          function() {
            $http.delete('/loc', {
              params: {
              location:scope.editLoc.name,
              type:scope.locType
            }
          }).
          success(function(data, status, headers, config) {
            if (scope.closeOnDelete !== null) {
              scope.closeOnDelete( {delete_loc:scope.editLoc} );
            }

            if (scope.internalControl !== null)
            {
              scope.internalControl.clearForm();
            }
          }).
          error(function(data, status, headers, config) {

          });
        });
      };
    }
  }
})

.directive('newLocation', function($modal, $http) {
  return {
    restrict: 'AE',
    scope: {
      allLocations: '=',
      locType: '=',
      closeOnSave: '&',
      control: '='
    },
    templateUrl: './view_loc/template_new_location.html',
    link: function(scope, elem, attrs) {

      // provides a way of exposing certain functions to outside controllers
      scope.internalControl = scope.control || {};

      scope.internalControl.clearNewForm = function() {
        scope.loc_name = '';
        scope.new_failure_msg = null;
        scope.form_ver = {};
        scope.form_ver.error_name = false;
      };
      scope.internalControl.clearNewForm();

      scope.saveNewLoc = function() {

        scope.new_failure_msg = null;
        scope.form_ver = {};
        scope.form_ver.error_name = false;

        // check if it's empty
        if (scope.loc_name == null || scope.loc_name == '')
        {
          scope.new_failure_msg = "Empty name!  Please enter a location name.";
          scope.form_ver.error_name = true;
          return;
        }
        // check if location is already in $scope.locations
        for (var i in scope.allLocations) {
          var existing = scope.allLocations[i];
          if (existing.name === scope.loc_name)
          {
            scope.new_failure_msg = "The location name " + scope.loc_name + " already exists!";
            scope.form_ver.error_name = true;
            return;
          }
        }

        $http.post('/loc', 
          {
            name:scope.loc_name,
            type:scope.locType
          }).
          success(function(data, status, headers, config) {
            // this callback will be called asynchronously when the response
            // is available
            console.log(data);

            if (scope.closeOnSave !== null) {
              scope.closeOnSave( {new_loc:scope.loc_name} );
            }

            if (scope.internalControl !== null)
            {
              scope.internalControl.clearNewForm();
            }

          }).
          error(function(data, status, headers, config) {
          });
      };

    }
  }
});