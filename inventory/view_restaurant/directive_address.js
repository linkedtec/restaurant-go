angular.module('myApp')

.directive('addressField', function($modal, $http, BeveragesService, DateService, VolUnitsService, MathService) {
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
      deliveryCopyZipcode: '=?'
    },
    templateUrl: './view_restaurant/template_address.html',
    link: function(scope, elem, attrs) {

      scope.editMode = false;
      scope.edit = {};
      scope.hideCancelButton = false; // if there's no valid address to revert
                                      // to, don't allow canceling
      scope.new_failure_msg = null;

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


      if (scope.addressLineOne===null && 
        (scope.addressLineTwo===null || scope.addressLineTwo===undefined) && 
        scope.city===null &&
        scope.state===null &&
        scope.zipcode===null) {
        scope.editAddress();
        scope.hideCancelButton = true;
      };

      scope.deliverySameChecked = false;

      scope.copyDeliveryAddress = function() {
        if (scope.isDelivery!==true || scope.deliverySameChecked!==true) {
          return;
        }

        scope.edit.addressLineOne = scope.deliveryCopyAddrOne;
        scope.edit.addressLineTwo = scope.deliveryCopyAddrTwo;
        scope.edit.city = scope.deliveryCopyCity;
        scope.edit.state = scope.deliveryCopyState;
        scope.edit.zipcode = scope.deliveryCopyZipcode;
      };

      scope.uncopyDeliveryAddress = function() {
        if (scope.isDelivery!==true || scope.deliverySameChecked!==false) {
          return;
        }

        scope.edit.addressLineOne = scope.addressLineOne;
        scope.edit.addressLineTwo = scope.addressLineTwo;
        scope.edit.city = scope.city;
        scope.edit.state = scope.state;
        scope.edit.zipcode = scope.zipcode;
      }
      
      scope.toggleDeliverySame = function() {
        scope.deliverySameChecked = !scope.deliverySameChecked;

        if (scope.deliverySameChecked === true) {
          scope.copyDeliveryAddress();
        } else {
          scope.uncopyDeliveryAddress();
        }
        
      };

      scope.saveEdit = function() {

        var all_clear = true;
        scope.form_ver = {
          error_address_one: false,
          error_address_two: false,
          error_city: false,
          error_state: false,
          error_zipcode: false
        }
        scope.new_failure_msg = null;

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
          return;
        }

        scope.editMode = false;

        scope.addressLineOne = scope.edit.addressLineOne;
        scope.addressLineTwo = scope.edit.addressLineTwo;
        scope.city = scope.edit.city;
        scope.state = scope.edit.state;
        scope.zipcode = scope.edit.zipcode;

        scope.hideCancelButton = false;
      };

      scope.cancelEdit = function() {
        scope.editMode = false;
      };

    }
  }
});