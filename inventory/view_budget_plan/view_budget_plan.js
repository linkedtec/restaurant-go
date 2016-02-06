'use strict';

angular.module('myApp.viewBudgetPlanner', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewBudgetPlanner', {
    templateUrl: 'view_budget_plan/view_budget_plan.html',
    controller: 'ViewBudgetPlannerCtrl'
  });
}])

.controller('ViewBudgetPlannerCtrl', function($scope, $modal, $http, ContactService, MathService) {

  $scope.edit_mode = false;
  $scope.monthly_budget = {value:null};
  $scope.remaining_budget = {value:null};
  $scope.remaining_budget_color="#02A930";
  $scope.budget_email = {value:null};
  $scope.budget_email_edit = {value:null};

  $scope.new_budget = {value:null};

  $scope.target_run_rate = {value: null};
  $scope.avg_markup = null;
  $scope.calc_budget = null;

  $scope.new_failure_msg_specific = null;
  $scope.new_failure_msg_calculated = null;
  $scope.new_failure_msg_email = null;

  $scope.form_ver = {};

  $scope.refreshRemainingBudgetColor = function() {
    if ($scope.remaining_budget.value !== null) {
      var percentage_left = $scope.remaining_budget.value / $scope.monthly_budget.value;
      if ( percentage_left <= 0 ) {
        // if negative budget left, red
        $scope.remaining_budget_color = "#EC5E55";
      } else if ( percentage_left < 0.25 ) {
        // if budget is less than 25% of monthly budget, yellow
        $scope.remaining_budget_color = "#DAAD23";
      } else {
        // otherwise green for normal
        $scope.remaining_budget_color="#02A930";
      } 
    }
  };

  $scope.getBudget = function() {
    var test_user_id = 1;
    $http.get('/budget', {
      params: {
        user_id: test_user_id
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.monthly_budget.value = data["monthly_budget"];
        $scope.target_run_rate.value = data["target_run_rate"];
        $scope.budget_email.value = data["budget_alert_email"];
        $scope.budget_email_edit.value = data["budget_alert_email"];
        $scope.remaining_budget.value = data["remaining_budget"];

        $scope.refreshRemainingBudgetColor();
      }
      $scope.getMarkups();
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getBudget();

  $scope.getMarkups = function() {

    var test_user_id = 1;
    $http.get('/markups', {
      params: {
        user_id: test_user_id
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.avg_markup = data["All"];
        $scope.runRateChanged();
      }
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.setEditMode = function(is_edit) {
    $scope.edit_mode = is_edit;
  };

  $scope.runRateChanged = function() {

    if ($scope.target_run_rate.value===null || $scope.target_run_rate.value===undefined || $scope.avg_markup===null) {
      $scope.calc_budget = null;
      return;
    }

    console.log($scope.target_run_rate.value)

    $scope.calc_budget = $scope.target_run_rate.value / $scope.avg_markup;
  };

  $scope.budgetUpdatedAlert = function() {
    swal({
      title: "Budget Updated!",
      text: "Your monthly budget has been updated, and will be used to inform the Purchasing process.",
      type: "success",
      allowOutsideClick: true,
      html: true});
  };

  $scope.saveSpecific = function() {

    
    $scope.form_ver.error_specific = false;
    $scope.new_failure_msg_specific = null;

    var all_clear = true;

    // if budget hasn't changed, don't post, just cancel editing
    if ($scope.new_budget.value!==null && $scope.new_budget.value===$scope.monthly_budget.value) {
      $scope.setEditMode(false);
      $scope.new_budget.value = null;
      return;
    }

    if ($scope.new_budget.value===null || MathService.numIsInvalidOrNegative($scope.new_budget.value)) {
      $scope.form_ver.error_specific = true;
      all_clear = false;
    }

    if (!all_clear) {
      $scope.new_failure_msg_specific = "Please enter a valid numeric value for the new monthly budget."
      return;
    }

    var test_user_id = 1;
    $http.post('/budget', {
      user_id:test_user_id,
      monthly_budget:$scope.new_budget.value,
      target_run_rate:null
    }).
    success(function(data, status, headers, config) {
      console.log(data)

      $scope.budgetUpdatedAlert();

      $scope.monthly_budget.value = $scope.new_budget.value;
      $scope.new_budget.value = null;
      $scope.setEditMode(false);
      $scope.refreshRemainingBudgetColor();
      $scope.getBudget();

    }).
    error(function(data, status, headers, config) {
    });

  }

  $scope.saveCalculated = function() {
    $scope.form_ver.error_target_run_rate = false;
    $scope.new_failure_msg_calculated = null;

    var all_clear = true;

    // if budget hasn't changed, don't post, just cancel editing
    if ($scope.calc_budget!==null && MathService.fixFloat2($scope.calc_budget)===MathService.fixFloat2($scope.monthly_budget.value)) {
      $scope.setEditMode(false);
      return;
    }

    if ($scope.target_run_rate.value===null || MathService.numIsInvalidOrNegative($scope.target_run_rate.value)) {
      $scope.form_ver.error_target_run_rate = true;
      all_clear = false;
    }

    if (!all_clear) {
      $scope.new_failure_msg_calculated = "Please enter a valid numeric value for the target monthly run rate."
      return;
    }

    var test_user_id = 1;
    $http.post('/budget', {
      user_id:test_user_id,
      monthly_budget:$scope.calc_budget,
      target_run_rate:$scope.target_run_rate.value
    }).
    success(function(data, status, headers, config) {
      console.log(data)

      $scope.budgetUpdatedAlert();

      $scope.monthly_budget.value = $scope.calc_budget;
      $scope.setEditMode(false);
      $scope.refreshRemainingBudgetColor();
      $scope.getBudget();

    }).
    error(function(data, status, headers, config) {
    });
    
  };

  $scope.saveEmail = function() {
    $scope.new_failure_msg_email = null;
    $scope.form_ver.error_email = false;

    var all_clear = true;

    // we allow the empty string / null as new email, which acts as a delete
    // if it's not empty, has to be valid email string
    if ($scope.budget_email_edit.value==='') {
      $scope.budget_email_edit.value = null;
    }

    if ($scope.budget_email_edit.value === $scope.budget_email.value) {
      return;
    }

    if ($scope.budget_email_edit.value!==null && !ContactService.isValidEmail($scope.budget_email_edit.value)) {
      $scope.form_ver.error_email = true;
      all_clear = false;
    }

    if (!all_clear) {
      $scope.new_failure_msg_email = "Email is not valid!  Please fix and try again.";
      return;
    }

    // we use PUT to edit email so it can be handled individually, and be 
    // cleared to null string if desired
    var test_user_id = 1;
    $http.put('/budget', {
      user_id:test_user_id,
      change_keys:['budget_alert_email'],
      budget:{'budget_alert_email':$scope.budget_email_edit.value}
    }).
    success(function(data, status, headers, config) {
      console.log(data)

      $scope.budget_email.value = $scope.budget_email_edit.value;

    }).
    error(function(data, status, headers, config) {
    });
    
    

  };

});


