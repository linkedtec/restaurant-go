angular.module('myApp')

.directive('deliveryAddress', function($modal, $http) {
  return {
    restrict: 'AE',
    scope: {
      choosable: '=?',
      control: '='
    },
    templateUrl: './view_pos/template_delivery_address.html',
    link: function(scope, elem, attrs) {

      scope.internalControl = scope.control || {};

      scope.restaurantControl = {};
      scope.deliveryControl = {};

      scope.deliverToRestaurant = {value:true};
      scope.deliverToDelivery = {value:false};

      scope.deliveryEmpty = false;

      scope.address = {
        'addressOne': null,
        'addressTwo': null,
        'city': null,
        'state': null,
        'zipcode': null
      };

      scope.addressDelivery = {
        'addressOne': null,
        'addressTwo': null,
        'city': null,
        'state': null,
        'zipcode': null
      };

      scope.deliverToRestaurantAddress = function() {
        scope.deliverToRestaurant.value = true;
        scope.deliverToDelivery.value = false;

      };

      scope.deliverToDeliveryAddress = function() {
        scope.deliverToRestaurant.value = false;
        scope.deliverToDelivery.value = true;

      };

      // if address is choosable and delivery address is valid,
      // choose delivery address preferentially
      if (scope.choosable) {
        if (scope.addressDelivery['addressOne'] !== null &&
          scope.addressDelivery['city'] !== null &&
          scope.addressDelivery['state'] !== null && 
          scope.addressDelivery['zipcode'] !== null) {
          scope.deliverToDeliveryAddress();
        }
      }

      scope.getRestaurantAddress = function() {
        $http.get('/restaurant/address', {
          params: { type: 'restaurant' }
        }).
        success(function(data, status, headers, config) {

          console.log(data);
          scope.address['addressOne'] = data['address_one'];
          scope.address['addressTwo'] = data['address_two'];
          scope.address['city'] = data['city'];
          scope.address['state'] = data['state'];
          scope.address['zipcode'] = data['zipcode'];

        }).
        error(function(data, status, headers, config) {

        });

        $http.get('/restaurant/address', {
          params: { type: 'delivery' }
        }).
        success(function(data, status, headers, config) {

          console.log(data);
          scope.addressDelivery['addressOne'] = data['address_one'];
          scope.addressDelivery['addressTwo'] = data['address_two'];
          scope.addressDelivery['city'] = data['city'];
          scope.addressDelivery['state'] = data['state'];
          scope.addressDelivery['zipcode'] = data['zipcode'];

          if (scope.addressDelivery['addressOne'] === null &&
            scope.addressDelivery['city']===null && 
            scope.addressDelivery['state']===null &&
            scope.addressDelivery['zipcode']===null) {
            scope.deliveryEmpty = true;
          } else {
            scope.deliverToDeliveryAddress();
          }

        }).
        error(function(data, status, headers, config) {

        });
      };
      scope.getRestaurantAddress();

      scope.saveRestaurantAddress = function() {

        $http.post('/restaurant/address', {
          type: 'restaurant',
          address_one: scope.address['addressOne'],
          address_two: scope.address['addressTwo'],
          city: scope.address['city'],
          state: scope.address['state'],
          zipcode: scope.address['zipcode']
        }).
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          //console.log(data);

        }).
        error(function(data, status, headers, config) {

        });
        
      };

      scope.saveDeliveryAddress = function() {
        console.log("SAVE DELIVERY ADDRESS");

        $http.post('/restaurant/address', {
          type: 'delivery',
          address_one: scope.addressDelivery['addressOne'],
          address_two: scope.addressDelivery['addressTwo'],
          city: scope.addressDelivery['city'],
          state: scope.addressDelivery['state'],
          zipcode: scope.addressDelivery['zipcode']
        }).
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          //console.log(data);

          // if this is a choosable UI and user saved delivery address,
          // that most likely means they want to use the delivery address
          // as the chosen address to deliver to
          if (scope.choosable===true) {
            scope.deliverToDeliveryAddress();
          }

        }).
        error(function(data, status, headers, config) {

        });
      };

      scope.deliverySaved = function() {
        scope.deliveryEmpty = false;
      };

      scope.internalControl.validateAddress = function() {
        scope.form_ver = {};
        scope.form_ver.error_restaurant = false;
        scope.form_ver.error_delivery = false;

        if (scope.deliverToRestaurant.value===true) {
          var valid = scope.restaurantControl.validateAddress();
          if (valid !== true) {
            scope.form_ver.error_restaurant = true;
          }
          return valid;
        } else {
          var valid = scope.deliveryControl.validateAddress();
          if (valid !== true) {
            scope.form_ver.error_delivery = true;
          }
          return valid;
        }
        return false;
      };

      scope.internalControl.getChosenAddressType = function() {
        if (scope.deliverToRestaurant.value===true) {
          return 'restaurant';
        }
        return 'delivery';
      }

    }
  }
});