'use strict';

angular.module('myApp.viewRestaurant', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewRestaurant', {
      templateUrl: 'view_restaurant/view_restaurant.html',
      controller: 'ViewRestaurantCtrl'
    });
}])

.controller('ViewRestaurantCtrl', function($scope, $modal, $http, ContactService) {

  $scope.form_ver = {};
  $scope.name_failure_msg = null;
  $scope.purchase_failure_msg = null;

  $scope.showPurchaseSave = false;
  $scope.purchaseInfo = {
    'contact': null,
    'contact_edit': null,
    'email': null,
    'email_edit': null,
    'phone': null,
    'phone_edit': null,
    'fax': null,
    'fax_edit': null
  };

  $scope.saveRestaurantName = function(new_name) {
    $scope.form_ver.error_name = false;

    if ($scope.restaurant_name_edit === $scope.restaurant_name) {
      return;
    }
    if ($scope.restaurant_name_edit === null || $scope.restaurant_name_edit.length === 0) {
      $scope.form_ver.error_name = true;
      $scope.name_failure_msg = "Please give your restaurant a name!";
      return;
    }

    $http.put('/restaurant/name', {
      name: $scope.restaurant_name_edit
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.restaurant_name = $scope.restaurant_name_edit;
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.revertRestaurantName = function() {
    $scope.restaurant_name_edit = $scope.restaurant_name;
    $scope.form_ver.error_name = false;
    $scope.name_failure_msg = null;
  };

  $scope.getRestaurant = function() {
    $http.get('/restaurant/name').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.restaurant_name = data['name'];
        $scope.restaurant_name_edit = data['name'];
      }
      else {
        $scope.restaurant_name = '';
        $scope.restaurant_name_edit = '';
      }
    }).
    error(function(data, status, headers, config) {

    });

    $http.get('/restaurant/purchase').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.purchaseInfo['contact'] = data['purchase_contact'];
        $scope.purchaseInfo['contact_edit'] = data['purchase_contact'];
        $scope.purchaseInfo['email'] = data['purchase_email'];
        $scope.purchaseInfo['email_edit'] = data['purchase_email'];
        $scope.purchaseInfo['phone'] = data['purchase_phone'];
        $scope.purchaseInfo['phone_edit'] = data['purchase_phone'];
        $scope.purchaseInfo['fax'] = data['purchase_fax'];
        $scope.purchaseInfo['fax_edit'] = data['purchase_fax'];
      }
      else {
        $scope.purchaseInfo['contact'] = null;
        $scope.purchaseInfo['contact_edit'] = null;
        $scope.purchaseInfo['email'] = null;
        $scope.purchaseInfo['email_edit'] = null;
        $scope.purchaseInfo['phone'] = null;
        $scope.purchaseInfo['phone_edit'] = null;
        $scope.purchaseInfo['fax'] = null;
        $scope.purchaseInfo['fax_edit'] = null;
      }
    }).
    error(function(data, status, headers, config) {

    });

  };
  $scope.getRestaurant();

  $scope.purchasingChanged = function() {

    if ($scope.purchaseInfo['contact_edit'] === '') {
      $scope.purchaseInfo['contact_edit'] = null;
    }
    if ($scope.purchaseInfo['email_edit'] === '') {
      $scope.purchaseInfo['email_edit'] = null;
    }
    if ($scope.purchaseInfo['phone_edit'] === '') {
      $scope.purchaseInfo['phone_edit'] = null;
    }
    if ($scope.purchaseInfo['fax_edit'] === '') {
      $scope.purchaseInfo['fax_edit'] = null;
    }

    if ($scope.purchaseInfo['contact'] !== $scope.purchaseInfo['contact_edit'] ||
      $scope.purchaseInfo['email'] !== $scope.purchaseInfo['email_edit'] ||
      $scope.purchaseInfo['phone'] !== $scope.purchaseInfo['phone_edit'] || 
      $scope.purchaseInfo['fax'] !== $scope.purchaseInfo['fax_edit']) {
      $scope.showPurchaseSave = true;
    } else {
      $scope.showPurchaseSave = false
    }
  };

  $scope.savePurchaseInfo = function() {
    var all_clear = true;

    $scope.form_ver.error_purchase_contact = false;
    $scope.form_ver.error_purchase_contact_email = false;
    $scope.form_ver.error_purchase_contact_phone = false;
    $scope.form_ver.error_purchase_contact_fax = false;
    $scope.purchase_failure_msg = null;

    if ($scope.purchaseInfo['contact_edit']===null || $scope.purchaseInfo['contact_edit'].length < 2) {
      all_clear = false;
      $scope.form_ver.error_purchase_contact = true;
    }

    if ($scope.purchaseInfo['email_edit']===null || !ContactService.isValidEmail($scope.purchaseInfo['email_edit'])) {
      all_clear = false;
      $scope.form_ver.error_purchase_contact_email = true;
    }

    if (!all_clear) {
      $scope.purchase_failure_msg = "Whoops!  Some fields are missing or incorrect.  Please fix them and try again.";
      return;
    }

    $http.put('/restaurant/purchase', {
      purchase_contact: $scope.purchaseInfo['contact_edit'],
      purchase_email: $scope.purchaseInfo['email_edit'],
      purchase_phone: $scope.purchaseInfo['phone_edit'],
      purchase_fax: $scope.purchaseInfo['fax_edit']
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.purchaseInfo['contact'] = $scope.purchaseInfo['contact_edit'];
      $scope.purchaseInfo['email'] = $scope.purchaseInfo['email_edit'];
      $scope.purchaseInfo['phone'] = $scope.purchaseInfo['phone_edit'];
      $scope.purchaseInfo['fax'] = $scope.purchaseInfo['fax_edit'];

      $scope.showPurchaseSave = false;
    }).
    error(function(data, status, headers, config) {

    });

    
  };

  $scope.revertPurchaseInfo = function() {

    $scope.form_ver.error_purchase_contact = false;
    $scope.form_ver.error_purchase_contact_email = false;
    $scope.form_ver.error_purchase_contact_phone = false;
    $scope.form_ver.error_purchase_contact_fax = false;
    $scope.purchase_failure_msg = null;

    $scope.purchaseInfo['contact_edit'] = $scope.purchaseInfo['contact'];
    $scope.purchaseInfo['email_edit'] = $scope.purchaseInfo['email'];
    $scope.purchaseInfo['phone_edit'] = $scope.purchaseInfo['phone'];
    $scope.purchaseInfo['fax_edit'] = $scope.purchaseInfo['fax'];

    $scope.showPurchaseSave = false;
  }

});


