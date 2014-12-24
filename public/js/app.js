var app = angular.module('steamoverload', [
    'ngRoute',
    'controllers'
]);

app.config(function ($routeProvider, $locationProvider) {
    $routeProvider.
        when('/', {
            templateUrl: '/static/partials/home.html',
            controller: 'HomeCtrl'
        }).
        when('/user/:userid', {
            templateUrl: '/static/partials/account.html',
            controller: 'AccountCtrl'
        }).
        otherwise({
            redirectTo: '/'
        });

    $locationProvider.html5Mode(true);
});

app.run(function ($rootScope, $location) {
    $rootScope.$on("$routeChangeStart", function (event, next, current) {
        if (next.requiresAuth && !$rootScope.user) {
            $location.path('/account/login');
        }
    });
});