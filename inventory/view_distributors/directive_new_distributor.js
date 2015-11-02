angular.module('myApp')

.directive('newKeg', function(DistributorsService, KegsService, VolUnitsService, MathService) {
  return {
    restrict: 'AE',
    scope: {
      distributor: '=',
      closeOnSave: '&'
    },
    templateUrl: './view_distributors/template_new_keg.html',
    link: function(scope, elem, attrs) {

      scope.new_keg = {
        volume: null,
        unit: null,
        deposit: null};

      scope.clearNewForm = function() {

        // form verification
        scope.form_ver = {};
        scope.form_ver.error_volume = false;
        scope.form_ver.error_unit = false;
        scope.form_ver.error_deposit = false;

        scope.new_failure_msg = null;
        scope.keg_exists_error = null;
      };

      scope.clearNewForm();

      scope.getVolUnits = function() {
        var result = VolUnitsService.get();
        result.then(
          function(payload) {
            var data = payload.data;
            if (data !== null) {
              scope.volume_units_full = data;
              scope.volume_units = [];
              for (var i=0; i < data.length; i++)
              {
                scope.volume_units.push(data[i].abbr_name);
              }
            }
          },
          function(errorPayload) {
            ; // do nothing for now
          });
      };
      scope.getVolUnits();

      scope.saveNewKeg = function() {
        
        scope.new_failure_msg = null;
        scope.keg_exists_error = null;
        scope.form_ver.error_volume = false;
        scope.form_ver.error_unit = false;
        scope.form_ver.error_deposit = false;

        var new_vol = scope.new_keg.volume;
        var new_unit = scope.new_keg.unit;
        var new_deposit = scope.new_keg.deposit;

        var all_clear = true;

        // first check volume and unit do not overlap with existing kegs
        for (var i in scope.distributor.kegs) {

          var oldKeg = scope.distributor.kegs[i];
          if (oldKeg.volume===new_vol && oldKeg.unit===new_unit) {
            scope.keg_exists_error = "This keg volume already exists for this distributor!  All keg volumes for a distributor must be unique.";
            scope.form_ver.error_volume = true;
            scope.form_ver.error_unit = true;
            all_clear = false;
          }
        }

        // new volume is not null and is a number
        if (new_vol===null || new_vol==='') {
          scope.form_ver.error_volume = true;
          all_clear = false;
        } else if (MathService.numIsInvalid(new_vol)) {
          scope.form_ver.error_volume = true;
          all_clear = false;
        }

        // new unit is not null
        if (new_unit===null || new_unit==='' || new_unit===undefined) {
          scope.form_ver.error_unit = true;
          all_clear = false;
        }

        // new deposit is a number (if it's not null)
        if (new_deposit!==null && new_deposit!=='' && MathService.numIsInvalid(new_deposit)) {
          scope.form_ver.error_deposit = true;
          all_clear = false;
        }

        if (!all_clear) {
          scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
          return;
        }

        // now post to server
        var result = KegsService.post(scope.distributor.id, scope.new_keg);
        result.then(
          function(payload) {

            if (scope.closeOnSave !== null) {
              scope.closeOnSave( {new_keg:payload.data} );
            }
          },
          function(errorPayload) {
            ; // do nothing for now
          });
      };
    }
  }
  
})

.directive('newDistributor', function(DistributorsService, ContactService, VolUnitsService, MathService) {
  return {
    restrict: 'AE',
    scope: {
      distributors: '=',
      closeOnSave: '&',
      control: '='    // shared control object allows outside controllers access to certain functions
    },
    templateUrl: './view_distributors/template_new_distributor.html',
    link: function(scope, elem, attrs) {

      // provides a way of exposing certain functions to outside controllers
      scope.internalControl = scope.control || {};

      scope.new_success_msg = null;

      scope.internalControl.clearSuccessMsg = function() {
        scope.new_success_msg = null;
      }

      scope.internalControl.clearNewForm = function() {
        scope.new_distributor = {};
        scope.new_distributor['name'] = null;
        scope.new_distributor['kegs'] = [{volume:null, unit:null, deposit:null}];

        // form verification
        scope.form_ver = {};
        scope.form_ver.error_name = false;
        scope.form_ver.error_email = false;
        scope.form_ver.errors_kegs_volume = [];
        scope.form_ver.errors_kegs_deposit = [];

        scope.new_failure_msg = null;
        scope.dist_name_msg = null;
        scope.email_failure_msg = null;
      };

      // On start, re-initialize state!
      scope.internalControl.clearNewForm();

      scope.addKegRow = function(unit) {
        scope.new_distributor['kegs'].push({volume:null, unit:unit, deposit:null});
      };

      scope.removeKegRow = function(index) {
        scope.new_distributor['kegs'].splice(index, 1);
      };

      scope.showKegHelp = function() {
        swal({
          title: "Distributor Kegs",
          text: "If you order tap beer from your distributor, it most likely comes in a keg with a deposit value.  If you receive kegs of different volumes from this distributor, enter a row for each volume amount and the associated deposit.",
          allowOutsideClick: true,
          html: true});
      };

      scope.addNewDistributor = function() {
        
        scope.new_success_msg = null;
        scope.new_failure_msg = null;
        scope.dist_name_msg = null;
        scope.email_failure_msg = null;

        var all_clear = true;

        // check all necessary fields are present
        if (scope.new_distributor['name'] === null || scope.new_distributor['name'] === '' )
        {
          scope.form_ver.error_name = true;
          all_clear = false;
        } else if (scope.new_distributor['name'].length >= 32) {
          scope.form_ver.error_name = true;
          scope.dist_name_msg = "Distributor name is too long!  Please limit name to 32 characters or less."
          all_clear = false;
        } else {
          scope.form_ver.error_name = false;
        }

        // check new distributor name does not already exist in existing distributors
        for (var i in scope.distributors) {
          if (scope.new_distributor['name'] === scope.distributors[i]['name']) {
            all_clear = false;
            scope.form_ver.error_name = true;
            scope.dist_name_msg = "Distributor name already exists!  Please provide a unique name for this distributor."
            break;
          }
        }

        scope.form_ver.error_email = false;
        if (scope.new_distributor['email']===null || scope.new_distributor['email'].length===0) {
          // it is okay to have empty email
          scope.new_distributor['email'] = null;
        } else if (scope.new_distributor['email'].length >= 64) {
          scope.email_failure_msg = "Email is too long (64 character limit)!";
          scope.form_ver.error_email = true;
          all_clear = false;
        } else if (!ContactService.isValidEmail(scope.new_distributor['email'])) {
          scope.email_failure_msg = "Email is not valid!  Please fix and try again.";
          scope.form_ver.error_email = true;
          all_clear = false;
        }

        // Collect the final list of kegs.
        var final_kegs = []
        for (var keg_i in scope.new_distributor['kegs'])
        {
          var keg = scope.new_distributor['kegs'][keg_i];
          // if volume, unit and deposit are null, discard
          if (keg['volume'] === null && keg['unit'] === null && keg['deposit'] === null) {
            continue;
          }
          final_kegs.push(keg);
        }

        for (var keg_i in final_kegs)
        {
          var keg = final_kegs[keg_i];

          if (keg.volume===null || keg.volume==='' || keg.unit===null || keg.unit==='') {
            scope.form_ver.errors_kegs_volume[keg_i] = true;
            all_clear = false;
          } else if (keg.volume!==null && keg.volume!=='' && MathService.numIsInvalid(keg.volume)) {
            scope.form_ver.errors_kegs_volume[keg_i] = true;
            all_clear = false;
          } else {
            scope.form_ver.errors_kegs_volume[keg_i] = false;
          }
          if (keg.deposit!==null && keg.deposit!=='' && MathService.numIsInvalid(keg.deposit)) {
            console.log(keg.deposit);
            scope.form_ver.errors_kegs_deposit[keg_i] = true;
            all_clear = false;
          } else {
            scope.form_ver.errors_kegs_deposit[keg_i] = false;
          }
        }

        scope.new_distributor['kegs'] = final_kegs;

        if (!all_clear) {
          scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
          // if ended up with kegs having length 0, push null row
          if (scope.new_distributor['kegs'].length === 0) {
            scope.new_distributor['kegs'] = [{volume:null, unit:null, deposit:null}];
          }
          return;
        }

        var result = DistributorsService.post(scope.new_distributor);
        result.then(
          function(payload) {
            scope.new_success_msg = scope.new_distributor['name'] + " has been added to your Distributors!"; 

            if (scope.closeOnSave !== null) {
              // returning an object with key new_distributor allows us to
              // pass the controller the new distributor from this directive!
              scope.closeOnSave( {new_distributor:payload.data} );
            }

            if (scope.internalControl !== null) {
              scope.internalControl.clearNewForm();
            }

          },
          function(errorPayload) {
            ; // do nothing for now
          });
      };

      scope.getVolUnits = function() {
        var result = VolUnitsService.get();
        result.then(
          function(payload) {
            var data = payload.data;
            if (data !== null) {
              scope.volume_units_full = data;
              scope.volume_units = [];
              for (var i=0; i < data.length; i++)
              {
                scope.volume_units.push(data[i].abbr_name);
              }
            }
          },
          function(errorPayload) {
            ; // do nothing for now
          });
      };
      scope.getVolUnits();
    }
  }
});

