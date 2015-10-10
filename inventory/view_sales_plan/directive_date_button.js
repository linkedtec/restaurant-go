angular.module('myApp')

.directive('dateButton', function($modal, $http, $timeout, DateService) {
  return {
    restrict: 'AE',
    scope: {
      date: '=',
      minDate: '=',  // date cannot go below this date
      maxDate: '=',  // date cannot go beyond this date
      onDateChange: '&',
      endOfDay: '=', // true means set hours to 23 59 59, false means 0 0 0 for start of day
      control: '='
    },
    templateUrl: './view_sales_plan/template_date_button.html',
    link: function(scope, elem, attrs) {

      // provides a way of exposing certain functions to outside controllers
      scope.internalControl = scope.control || {};
      scope.form_ver = {
        'error_date': false
      }

      scope.internalControl.validate = function() {
        scope.form_ver.error_date = false;

        if (!DateService.isValidDate(scope.date) ) {
          scope.form_ver.error_date = true;
        }

        return scope.form_ver.error_date === false;
      }

      //=====================================
      // Date picker
      scope.opened = {value:false};

      scope.formats = ['MMMM dd yyyy', 'yyyy/MM/dd', 'dd.MM.yyyy', 'shortDate'];
      scope.format = scope.formats[0];

      scope.clear = function () {
        scope.date = null;
      };

      scope.openDate = function($event) {
        $event.preventDefault();
        $event.stopPropagation();

        scope.opened.value = !scope.opened.value;
        
      };

      scope.dateChanged = function() {

        scope.form_ver.error_date = false;
        if (!DateService.isValidDate(scope.date)) {
          scope.form_ver.error_date = true;
          return;
        }

        if (scope.date < scope.minDate) {
          scope.form_ver.error_date = true;
          return;
        }

        if (scope.date > scope.maxDate) {
          scope.form_ver.error_date = true;
          return;
        }

        if (scope.endOfDay) {
          scope.date.setHours(23,59,59);
        } else {
          scope.date.setHours(0,0,0);
        }
        console.log('date is now: ' + scope.date);

        $timeout((function() {
          if (scope.onDateChange!==null) {
            scope.onDateChange();
          }
        }), 0);

      };

      scope.dateOptions = {
        formatYear: 'yy',
        startingDay: 1,
        showWeeks:'false'
      };

      scope.getDayClass = function(date, mode) {
        if (mode === 'day') {
          var dayToCheck = new Date(date).setHours(0,0,0,0);

          for (var i=0;i<scope.events.length;i++){
            var currentDay = new Date(scope.events[i].date).setHours(0,0,0,0);

            if (dayToCheck === currentDay) {
              return scope.events[i].status;
            }
          }
        }

        return '';
      };
    }
  }
});