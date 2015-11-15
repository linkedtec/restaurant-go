angular.module('myApp')

.directive('addressField', function($modal, $http, $timeout) {
  return {
    restrict: 'AE',
    scope: {
      addressLineOne: '=',   // for typeahead lookup
      addressLineTwo: '=?',
      city: '=',
      state: '=',
      zipcode: '=',
      phone: '=?',
      fax: '=?',
      isDelivery: '=?',
      deliveryCopyAddrOne: '=?',
      deliveryCopyAddrTwo: '=?',
      deliveryCopyCity: '=?',
      deliveryCopyState: '=?',
      deliveryCopyZipcode: '=?',
      callerSave: '&',
      control: '=',
      deliverySaved: '&'
    },
    templateUrl: './view_restaurant/template_address.html',
    link: function(scope, elem, attrs) {

      scope.$watch('control', function(newVal, oldVal) {
        scope.internalControl = scope.control || {};
        // This will check that the address is ready for use for e.g., purchase
        // orders, and is functionally a little different from addressIsValid()
        scope.internalControl.validateAddress = function() {
          scope.new_failure_msg = null;
          // if address is in edit mode it is not ready for use, needs
          // to be saved first
          if (scope.editMode === true) {
            scope.new_failure_msg = "Please save address first, then try again!"
            return false;
          }
          var addressValid = scope.addressIsValid(false);
          return addressValid;
        };
      }, true);

      scope.editMode = false;
      scope.edit = {};
      scope.hideCancelButton = false; // if there's no valid address to revert
                                      // to, don't allow canceling
      scope.new_failure_msg = null;
      scope.deliverySameChecked = {value:false};
      scope.deliveryEmpty = false;

      scope.$watch('addressLineOne + addressLineTwo + city + state + zipcode', function(newVal, oldVal) {
        console.log(scope.addressLineOne);
        scope.edit.addressLineOne = scope.addressLineOne;
        scope.edit.addressLineTwo = scope.addressLineTwo;
        scope.edit.city = scope.city;
        scope.edit.state = scope.state;
        scope.edit.zipcode = scope.zipcode;
        if (scope.addressLineOne===null && 
          (scope.addressLineTwo===null || scope.addressLineTwo===undefined) && 
          scope.city===null &&
          scope.state===null &&
          scope.zipcode===null) {
          if (scope.isDelivery === true) {
            scope.deliveryEmpty = true;
          } else {
            scope.editAddress();
            scope.hideCancelButton = true;
          }
          
        } else {
          scope.editMode = false;
          scope.hideCancelButton = false;
          scope.deliveryEmpty = false;
        }
      }, true);


      scope.editAddress = function() {
        scope.editMode = true;

        console.log(scope.addressLineOne);

        scope.edit.addressLineOne = scope.addressLineOne;
        scope.edit.addressLineTwo = scope.addressLineTwo;
        scope.edit.city = scope.city;
        scope.edit.state = scope.state;
        scope.edit.zipcode = scope.zipcode;
        //scope.phone_edit = scope.phone;
        //scope.fax_edit = scope.fax;
      };


      scope.copyDeliveryAddress = function() {
        if (scope.isDelivery!==true || scope.deliverySameChecked.value!==true) {
          return;
        }

        scope.edit.addressLineOne = scope.deliveryCopyAddrOne;
        scope.edit.addressLineTwo = scope.deliveryCopyAddrTwo;
        scope.edit.city = scope.deliveryCopyCity;
        scope.edit.state = scope.deliveryCopyState;
        scope.edit.zipcode = scope.deliveryCopyZipcode;
      };

      scope.uncopyDeliveryAddress = function() {
        if (scope.isDelivery!==true || scope.deliverySameChecked.value!==false) {
          return;
        }

        scope.edit.addressLineOne = scope.addressLineOne;
        scope.edit.addressLineTwo = scope.addressLineTwo;
        scope.edit.city = scope.city;
        scope.edit.state = scope.state;
        scope.edit.zipcode = scope.zipcode;
      }
      
      scope.toggleDeliverySame = function() {

        if (scope.deliverySameChecked.value === true) {
          scope.copyDeliveryAddress();
        } else {
          scope.uncopyDeliveryAddress();
        }
        
      };

      scope.clearFormVer = function() {
        scope.form_ver = {
          error_address_one: false,
          error_address_two: false,
          error_city: false,
          error_state: false,
          error_zipcode: false
        }
        scope.new_failure_msg = null;
      }

      scope.addressIsValid = function( update_ui ) {
        scope.clearFormVer();

        var all_clear = true;

        if (scope.edit.addressLineOne === null || scope.edit.addressLineOne.length < 3) {
          scope.form_ver.error_address_one = true;
          all_clear = false;
        }

        if (scope.edit.city === null || scope.edit.city.length < 2) {
          scope.form_ver.error_city = true;
          all_clear = false;
        }

        if (scope.edit.state === null || scope.edit.state.length !== 2) {
          scope.form_ver.error_state = true;
          all_clear = false;
        }

        if (scope.edit.zipcode === null || scope.edit.zipcode.length < 5) {
          scope.form_ver.error_zipcode = true;
          all_clear = false;
        }

        if (all_clear !== true) {
          scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
        }

        if (update_ui !== true) {
          scope.clearFormVer();
        }

        if (all_clear === true) {
          return true;
        }
        return false;
      };

      scope.saveEdit = function() {

        var addressValid = scope.addressIsValid(true);
        if (addressValid !== true) {
          return;
        }
        
        scope.editMode = false;
        scope.deliveryEmpty = false;
        if (scope.deliverySaved!==undefined && scope.deliverySaved!==null) {
          scope.deliverySaved();
        }

        scope.addressLineOne = scope.edit.addressLineOne;
        scope.addressLineTwo = scope.edit.addressLineTwo;
        scope.city = scope.edit.city;
        scope.state = scope.edit.state;
        scope.zipcode = scope.edit.zipcode;

        scope.hideCancelButton = false;

        $timeout((function() {
          if (scope.callerSave!==undefined && scope.callerSave !== null) {
            scope.callerSave();
          }
        }), 0);
        
      };

      scope.cancelEdit = function() {
        scope.editMode = false;
      };

    }
  }
});