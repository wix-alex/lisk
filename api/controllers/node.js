/*
 * Copyright © 2018 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 */
'use strict';

var _ = require('lodash');
var checkIpInList = require('../../helpers/checkIpInList.js');
var apiCodes = require('../../helpers/apiCodes');
var swaggerHelper = require('../../helpers/swagger');

// Private Fields
var modules;
var config;

/**
 * @module controllers/node
 * @requires lodash
 * @requires module:helpers/apiCodes.FORBIDDEN
 * @requires module:helpers/apiCodes.NOT_FOUND
 * @requires module:helpers/checkIpInList
 * @requires module:helpers/swagger.generateParamsErrorObject
 * @requires module:helpers/swagger.invalidParams
 * @param {Object} scope - App instance.
 * @todo: add description of NodeController
 */
function NodeController (scope) {
	modules = scope.modules;
	config = scope.config;
}

/**
 * @public
 * @param {Object} context
 * @param {function} next
 * @todo: add description of the function and its parameters
 */
NodeController.getConstants = function (context, next) {
	modules.node.shared.getConstants(null, function (err, data) {
		try {
			if (err) { return next(err); }

			data = _.cloneDeep(data);

			// Perform required typecasts for integer
			// or bignum properties when returning an API response
			data.supply = data.supply.toString();
			data.milestone = data.milestone.toString();
			data.reward = data.reward.toString();
			data.fees.dappDeposit = data.fees.dappDeposit.toString();
			data.fees.dappWithdrawal = data.fees.dappWithdrawal.toString();
			data.fees.dappRegistration = data.fees.dappRegistration.toString();
			data.fees.multisignature = data.fees.multisignature.toString();
			data.fees.delegate = data.fees.delegate.toString();
			data.fees.secondSignature = data.fees.secondSignature.toString();
			data.fees.vote = data.fees.vote.toString();
			data.fees.send = data.fees.send.toString();
			data.fees.data = data.fees.data.toString();

			next(null, data);

		} catch (error) {
			next(error);
		}
	});
};

/**
 * @public
 * @param {Object} context
 * @param {function} next
 * @todo: add description of the function and its parameters
 */
NodeController.getStatus = function (context, next) {
	modules.node.shared.getStatus(null, function (err, data) {
		try {
			if (err) { return next(err); }

			data = _.cloneDeep(data);

			// Check if properties are null, then set it to 0
			// as per schema defined for these properties in swagger
			data.networkHeight = data.networkHeight || 0;
			data.consensus = data.consensus || 0;

			modules.transactions.shared.getTransactionsCount(function (err, count) {
				if (err) { return next(err); }

				data.transactions = count;

				next(null, data);
			});
		} catch (error) {
			next(error);
		}
	});
};

/**
 * @public
 * @param {Object} context
 * @param {function} next
 * @todo: add description of the function and its parameters
 */
NodeController.getForgingStatus = function (context, next) {
	if (!checkIpInList(config.forging.access.whiteList, context.request.ip)) {
		context.statusCode = apiCodes.FORBIDDEN;
		return next(new Error('Access Denied'));
	}

	var publicKey = context.request.swagger.params.publicKey.value;

	modules.node.internal.getForgingStatus(publicKey, function (err, data) {
		if (err) { return next(err); }

		next(null, data);
	});
};

/**
 * @public
 * @param {Object} context
 * @param {function} next
 * @todo: add description of the function and its parameters
 */
NodeController.updateForgingStatus = function (context, next) {
	if (!checkIpInList(config.forging.access.whiteList, context.request.ip)) {
		context.statusCode = apiCodes.FORBIDDEN;
		return next(new Error('Access Denied'));
	}

	var publicKey = context.request.swagger.params.data.value.publicKey;
	var decryptionKey = context.request.swagger.params.data.value.decryptionKey;

	modules.node.internal.toggleForgingStatus(publicKey, decryptionKey, function (err, data) {
		if (err) {
			context.statusCode = apiCodes.NOT_FOUND;
			return next(err);
		}

		next(null, [data]);
	});
};

/**
 * @public
 * @param {Object} context
 * @param {function} next
 * @todo: add description of the function and its parameters
 */
NodeController.getPooledTransactions = function (context, next) {
	var invalidParams = swaggerHelper.invalidParams(context.request);

	if (invalidParams.length) {
		return next(swaggerHelper.generateParamsErrorObject(invalidParams));
	}

	var params = context.request.swagger.params;

	var state = context.request.swagger.params.state.value;

	var stateMap = {
		unprocessed: 'getUnProcessedTransactions',
		unconfirmed: 'getUnconfirmedTransactions',
		unsigned: 'getMultisignatureTransactions'
	};

	var filters = {
		id: params.id.value,
		recipientId: params.recipientId.value,
		recipientPublicKey: params.recipientPublicKey.value,
		senderId: params.senderId.value,
		senderPublicKey: params.senderPublicKey.value,
		type: params.type.value,
		sort: params.sort.value,
		limit: params.limit.value,
		offset: params.offset.value
	};

	// Remove filters with null values
	filters = _.pickBy(filters, function (v) {
		return !(v === undefined || v === null);
	});

	modules.transactions.shared[stateMap[state]].call(this, _.clone(filters), function (err, data) {
		if (err) { return next(err); }

		var transactions = _.map(_.cloneDeep(data.transactions), function (transaction) {
			transaction.senderId = transaction.senderId || '';
			transaction.recipientId = transaction.recipientId || '';
			transaction.recipientPublicKey = transaction.recipientPublicKey || '';
			transaction.multisignatures = transaction.signatures;

			transaction.amount = transaction.amount.toString();
			transaction.fee = transaction.fee.toString();

			delete transaction.signatures;
			return transaction;
		});

		next(null, {
			data: transactions,
			meta: {
				offset: filters.offset,
				limit: filters.limit,
				count: parseInt(data.count)
			}
		});
	});
};

module.exports = NodeController;
