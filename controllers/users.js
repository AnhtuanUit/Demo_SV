var mongoose = require('mongoose');
var Users = mongoose.model('Users');
var Messages = mongoose.model('Messages');
var Friends = mongoose.model('Friends');
var Files = require('../controllers/files');
var Config = require('../config/config');
var Utilities = require('../config/utilities');
var jwt = require('jsonwebtoken');
var async = require('async');




// Get all user's friends // ABCXYZ
exports.getAllFriends = function(req, res) {
    Users.find().limit(1000).select(Config.Populate.User + ' latitude longitude phone country').lean().exec(function(err, users) {
        if (err || !users.length) {
            return res.jsonp(Utilities.response(false, []));
        } else {
            async.map(users, function(user, cb) {
                Users.detail(user, null, function(u) {
                    return cb(null, u);
                });
            }, function(err, data) {
                return res.jsonp(Utilities.response(true, data));
            });
        }
    });
};



exports.getContact = function  (req, res) {
    var userId = req.user._id;
    
    var allFriend ;
    Friends.find({$or: [{'senderId': userId},{'receiverId': userId}], success: true}, function  (err, friend) {
        if (err) {
            return res.jsonp(Utilities.response(false, {}, Utilities.getErrorMessage(req, err)));
        } else {
            async.map(friend, function(friend, cb) {
                Friends.getUserId(friend, userId, function(u) {
                    return cb(null, u);
                });
            }, function(err, data) {
                Users.find({$or: data},function(err, users) {
                    if (err || !users.length) {
                        return res.jsonp(Utilities.response(false, []));
                    } else {
                        async.map(users, function(user, cb) {
                            Users.detail(user, null, function(u) {
                                return cb(null, u);
                            });
                        }, function(err, data) {
                            return res.jsonp(Utilities.response(true, data));
                        });
                    }
                });
            });
        }
    });


}

/* *************************** NEW CODE ******************************** */

// Middleware
exports.queryLeanUser = function(req, res, next, id) {
    Utilities.validateObjectId(id, function(isValid) {
        if (!isValid) {
            return res.status(404).jsonp(Utilities.response(false, {}, 'Invalid user id', 404));
        } else {
            var populateFields = (req.user._id === id) ? Config.Populate.UserFull : Config.Populate.User;
            Users.findOne({
                '_id': id,
                'status': Config.User.Status.Active
            }).lean().select(populateFields).exec(function(err, user) {
                if (err) {
                    return res.jsonp(Utilities.response(false, {}, Utilities.getErrorMessage(req, err)));
                } else if (!user) {
                    return res.status(404).jsonp(Utilities.response(false, {}, 'User not found', 404));
                } else {
                    req.userData = user;
                    return next();
                }
            });
        }
    });
};

exports.queryUser = function(req, res, next, id) {
    Utilities.validateObjectId(id, function(isValid) {
        if (!isValid) {
            return res.status(404).jsonp(Utilities.response(false, {}, 'Invalid user id', 404));
        } else {
            Users.findOne({
                '_id': id,
                'status': Config.User.Status.Active
            }).exec(function(err, user) {
                if (err) {
                    return res.jsonp(Utilities.response(false, {}, Utilities.getErrorMessage(req, err)));
                } else if (!user) {
                    return res.status(404).jsonp(Utilities.response(false, {}, 'User not found', 404));
                } else {
                    req.userData = user;
                    return next();
                }
            });
        }
    });
};

// Register an account
exports.signup = function(req, res) {
    var user;
    async.series({
        createUserObject: function(cb) {
            user = new Users(req.body);
            return cb(null);
        },
        formatPhoneNumber: function(cb) {
            // ABCXYZ
            if (user.phone) {
                user.phone = user.phone.trim();
            }
            return cb(null);
        },
        save: function(cb) {
            user.save(function(err) {
                if (err) {
                    return cb(true, Utilities.getErrorMessage(req, err));
                } else {
                    return cb(null);
                }
            });
        },
        token: function(cb) {
            var profile = {
                _id: user._id,
                username: user.username,
                avatar: user.avatar,
                gender: user.gender,
                role: user.role
            };
            // Create token
            token = jwt.sign(profile, Config.JWTSecret);
            return cb(null, token);
        },
        avatar: function(cb) {
            if (user.gender == 1) {
                return cb(null, Config.Env[process.env.NODE_ENV].Image + 'male.png');
            } else {
                return cb(null, Config.Env[process.env.NODE_ENV].Image + 'female.png');
            }

        }
    }, function(err, results) {
        if (err) {
            var keys = Object.keys(results);
            var last = keys[keys.length - 1];
            return res.jsonp(Utilities.response(false, {}, results[last]));
        } else {
            return res.jsonp(Utilities.response(true, {
                '_id': user._id,
                'token': results.token,
                'username': user.username,
                'avatar': results.avatar
            }));
        }
    });
};



// Change password
exports.changePassword = function(req, res) {
    var oldPassword = req.body.oldPassword ? req.body.oldPassword.toString() : '';
    var newPassword = req.body.newPassword ? req.body.newPassword.toString() : '';
    var user = req.userData;
    // Check old password, if not correct, return
    if (!user.checkLogin(oldPassword)) {
        return res.jsonp(Utilities.response(false, {}, 'Old password was not correct'));
    } else {
        // Generate new password hash
        var newHashedPassword = user.hashPassword(newPassword, user.salt);
        user.update({
            'hashed_password': newHashedPassword
        }, function(err) {
            if (err) {
                return res.jsonp(Utilities.response(false, {}, Utilities.getErrorMessage(req, err)));
            } else {
                return res.jsonp(Utilities.response(true, {}, 'Change password successfully'));
            }
        });
    }
};

// Change avatar
exports.changeAvatar = function(req, res) {
    var avatarName = req.body.thumbnail;
    if (false) {
        return res.jsonp(Utilities.response(false, {}, 'No file to upload'));
    } else {

        async.series ({
            uploadAvatar: function (cb) {
                Files.uploadImage(req, res, function (err, results, newName) {
                    avatarName = newName;
                    console.log(newName);                  
                    if (err) {
                        return cb(true, results);
                    } else{
                        
                        return cb(null);
                    };
                    
                    
                });
            },
            updateUser: function(cb) {
                req.userData.update({'avatar': avatarName}, function (err) {
                    if (err) {
                        return cb(true, Utilities.getErrorMessage(req, err));
                    } else {

                        return cb(null);
                    }
                });
            }
        }, function (err, results) {
            if(err) {
                var keys = Object.keys(results);
                var last = keys[keys.length - 1];
                return res.jsonp (Utilities.response(false, {}, results[last]));

            } 
            else{
                res.jsonp (Utilities.response(true, {'avatar': avatarName}));
            }
        });
}
};
// Get user by id
exports.getUserById = function(req, res) {
    var userId = req.user ? req.user._id.toString() : '';
    Users.getFullInformations(req.userData, userId, function(data) {
        return res.jsonp(Utilities.response(true, data));
    });
};

// Do login
exports.login = function(req, res) {
    var username = req.body.username ? req.body.username.toString() : '';
    var password = req.body.password ? req.body.password.toString() : '';
    // Trim username (email/phone)
    username = username.trim();

    var user;
    // Do functions in series
    async.series({
        findUser: function(cb) {
            async.parallel({
                findByEmail: function(cb1) {
                    Users.findOne({
                        'email': username,
                        'status': Config.User.Status.Active
                    })
                    .select('-accType -socialProfile')
                    .exec(function(err, u) {
                        if (u) {
                            user = u;
                        }
                        return cb1();
                    });
                },
                findByPhoneNumber: function(cb1) {
                    Users.findOne({
                        'username': username,
                        'status': Config.User.Status.Active
                    })
                    .select('-accType -socialProfile')
                    .exec(function(err, u) {
                        if (u) {
                            user = u;
                        }
                        return cb1();
                    });
                }
            }, function() {
                return cb(!user, 'Incorrect email/phone number or password');
            });
},
checkPassword: function(cb) {
    return cb(!user.checkLogin(password), 'Incorrect email/phone number or password');
},
getUserInformations: function(cb) {
    Users.getFullInformations(user, null, function(data) {
        user = data;
        return cb(null);
    });
},
createToken: function(cb) {
    var profile = {
        _id: user._id,
        username: user.username,
        avatar: user.avatar,
        gender: user.gender,
        role: user.role
    };
            // Create token
            var token = jwt.sign(profile, Config.JWTSecret);
            user.token = token;
            return cb(null);
        }
    }, function(err, results) {
        if (err) {
            var keys = Object.keys(results);
            var last = keys[keys.length - 1];
            return res.jsonp(Utilities.response(false, {}, results[last]));
        } else {
            return res.jsonp(Utilities.response(true, user));
        }
    });
};

// Logout // ABCXYZ Do something when user logout
exports.logout = function(req, res) {
    return res.jsonp(Utilities.response(true));
};


// Update user informations
exports.updateUserById = function(req, res) {
    var user = req.userData;
    // Pick needed fields and extend user
    var data = Utilities.pickFields(req.body, ['username', 'gender', 'address', 'phone', 'desc']);
    Utilities.extendObject(user, data);

    // Remove email, role, password and salt fields (if have)
    var removeFields = ['email', 'hashed_password', 'salt'];
    if (req.user.role !== 1) {
        removeFields.push('role');
        removeFields.push('status');
    }
    for (var i in removeFields) {
        user[removeFields[i]] = undefined;
        delete user[removeFields[i]];
    }

    user.save(function(err) {
        if (err) {
            return res.jsonp(Utilities.response(false, {}, Utilities.getErrorMessage(req, err)));
        } else {
            return res.jsonp(Utilities.response(true, user.toObject()));
        }
    });
};

exports.addLocation = function(req, res) {
    var user = req.userData;
    console.log(req.body);
    // Remove email, role, password and salt fields (if have)
    var data = Utilities.pickFields(req.body, ['latitude','longitude']);
    Utilities.extendObject(user, data);

    var removeFields = ['email', 'hashed_password', 'salt'];
    if (req.user.role !== 1) {
        removeFields.push('role');
        removeFields.push('status');
    }
    for (var i in removeFields) {
        user[removeFields[i]] = undefined;
        delete user[removeFields[i]];
    }
    mongoose.model('Users').update({ _id: req.params.userId }, { $set: { latitude: req.body.latitude , longitude: req.body.longitude}}, function  (err) {
        if (err) {
            return res.jsonp(Utilities.response(false, {}, Utilities.getErrorMessage(req, err)));
        } else {
            return res.jsonp(Utilities.response(true, user.toObject()));
        }
    });

};


// Inactive user
exports.inactiveUserById = function(req, res) {
    var user = req.userData;
    user.update({
        'status': Config.User.Status.Inactive
    }, function(err) {
        if (err) {
            return res.jsonp(Utilities.response(false, {}, Utilities.getErrorMessage(req, err)));
        } else {
            return res.jsonp(Utilities.response(true));
        }
    });
};


exports.getChatHistory = function(req, res) {
    // Get params
    var userId = req.user._id.toString();

    Messages.find({
        '_userId': userId,
    /*    'updatedAt': {
            $lt: timestamp
        }*/
    },function  (err, result) {
        res.jsonp(Utilities.response(true, result));
    });
};

