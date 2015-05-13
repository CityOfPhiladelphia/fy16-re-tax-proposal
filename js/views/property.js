/*global $,app,google,accounting,Mustache*/

app.views.property = function (accountNumber) {
  var alreadyGettingOpaData, opaRendered, opaDetailsRendered;

  // Search area prep
  app.hooks.propertyTitle.find('h1').html('&nbsp;');
  app.hooks.propertyTitle.find('.small-text').empty();
  app.hooks.search.val('');
  app.hooks.search.attr('placeholder', 'Search for another property');
  app.hooks.searchForm.removeClass('hint');
  app.hooks.searchForm.find('p').addClass('hidden');
  app.hooks.searchLeft.removeClass('medium-4').addClass('medium-14')
    .empty().append(app.hooks.propertyTitle);
    app.hooks.searchRight.html('');
  app.hooks.searchBox.removeClass('medium-16').addClass('medium-10 float-right');

  // Clear existing elements out of the way
  app.hooks.content.children().detach();

  if (!history.state) history.replaceState({}, '');

  if (history.state.error) return renderError();

  if (history.state.opa) {
    renderOpa();
  } else {
    app.hooks.content.append(app.hooks.loading);
    getOpaData();
  }

  if (history.state.sa) {
    renderSa();
  } else if (history.state.address) {
    getSaData();
  }

  function getOpaData () {
    alreadyGettingOpaData = true;
    $.ajax('https://api.phila.gov/opa/v1.1/account/' + accountNumber + '?format=json',
      {dataType: app.settings.ajaxType})
      .done(function (data) {
        var state = $.extend({}, history.state);
        var property = data.data.property;
        state.opa = property;
        state.address = app.util.addressWithUnit(property);
        history.replaceState(state, ''); // Second param not optional in IE10
        if (!opaRendered) renderOpa();
        if (!state.sa) getSaData();
      })
      .fail(function () {
        history.replaceState({error: true}, '');
        renderError();
      });
  }

  function getSaData () {
    $.ajax('https://api.phila.gov/ulrs/v3/addresses/' + encodeURIComponent(history.state.address) +
      '/service-areas?format='+app.settings.ajaxType, {dataType: app.settings.ajaxType})
      .done(function (data) {
        var state = $.extend({}, history.state);
        state.sa = data.serviceAreaValues;
        history.replaceState(state, '');
        renderSa();
      })
      .fail(function () {
        var state = $.extend({}, history.state);
        state.sa = {error: true};
        history.replaceState(state, '');
      });
  }

  function bindDetailsToggleClick(rootEl) {
    $(rootEl).off('click').on('click', '.details-toggle', function(evt) {
      evt.preventDefault();
      var $button = $(this),
          $details = $button.next('.details');

      $details.toggleClass('hidden');
      if ($details.hasClass('hidden')) {
        $button.text('Show Details');
      } else {
        $button.text('Hide Details');
      }
    });
  }

  function renderOpa () {
    var state = history.state,
        fy16 = state.opa.valuation_history[0],
        taxable = fy16.land_taxable + fy16.improvement_taxable,
        exempt = fy16.land_exempt + fy16.improvement_exempt,
        rateProposed = 0.014651,
        rateCurrent = 0.0134,
        totalProposed = taxable * rateProposed,
        totalCurrent = taxable * rateCurrent,
        increaseAnnual = totalProposed - totalCurrent,
        increaseAnnualPretty = accounting.formatMoney(increaseAnnual),
        increaseMonth = increaseAnnual / 12,
        increaseMonthPretty = accounting.formatMoney(increaseMonth),
        increaseWeek = increaseAnnual / 52,
        increaseWeekPretty = accounting.formatMoney(increaseWeek),
        increaseDay = increaseAnnual / 365,
        increaseDayPretty = accounting.formatMoney(increaseDay);


    // Daily dollars to cents
    if (increaseDay < 1) {
      increaseDayPretty = increaseDay.toFixed(2) + '&cent;';
    }

    // Breadcrumbs
    app.hooks.propertyCrumb.text(state.address);
    app.hooks.crumbs.update(app.hooks.propertyCrumb);

    // Search area
    app.hooks.propertyTitle.find('h1').text(state.address);
    app.hooks.propertyTitle.find('.small-text').text('#' + state.opa.account_number);

    // Schools
    app.hooks.schoolList.text('Loading...');

    // Tax differences
    app.hooks.taxIncreaseAnnual.html(increaseAnnualPretty);
    app.hooks.taxIncreaseMonth.html(increaseMonthPretty);
    app.hooks.taxIncreaseWeek.html(increaseWeekPretty);
    app.hooks.taxIncreaseDay.html(increaseDayPretty);

    // Tax details
    app.hooks.currentRate.text((rateCurrent * 100) + '%');
    app.hooks.currentTaxValue.text(accounting.formatMoney(totalCurrent));
    app.hooks.currentMarketValue.text(accounting.formatMoney(fy16.market_value));
    app.hooks.currentAbatementValue.text(accounting.formatMoney(exempt));
    app.hooks.currentTaxableValue.text(accounting.formatMoney(taxable));

    app.hooks.proposedRate.text((rateProposed * 100) + '%');
    app.hooks.proposedTaxValue.text(accounting.formatMoney(totalProposed));


    // Clear loading...
    app.hooks.content.empty();

    app.hooks.content.append(app.hooks.propertyMain);

    bindDetailsToggleClick(app.hooks.propertyMain);

    opaRendered = true;

    // Rebind the tooltips that we just rendered
    $(document).foundation('tooltip', 'reflow');
  }

  function renderSa () {
    var state = history.state,
        elementarySchool, middleSchool, highSchool;

    // No use rendering if there's been a data error
    if (state.error || state.sa.error) return;

    // Wait for both OPA render and SA data
    if (!opaRendered || !state.sa) return;

    // Get school keys
    state.sa.forEach(function (sa) {
      switch (sa.serviceAreaId) {
        // School catchment
        case 'SA_SCHOOLS_Elementary_School_Catchment':
          elementarySchool = sa.value;
          break;
        case 'SA_SCHOOLS_Middle_School_Catchment':
          middleSchool = sa.value;
          break;
        case 'SA_SCHOOLS_High_School_Catchment':
          highSchool = sa.value;
      }
    });

    // Render schools, in order
    app.hooks.schoolList.empty();
    renderSchool(elementarySchool);

    // There are many K-8 schools
    if (middleSchool !== elementarySchool) {
      renderSchool(middleSchool);
    }

    renderSchool(highSchool);

    // Rebind the tooltips that we just rendered
    $(document).foundation('tooltip', 'reflow');
  }

  function renderSchool(schoolShortName, schoolType) {
    var html = app.hooks.schoolDetails.html(),
        schoolData = app.data.school_data[schoolShortName],
        data, i, prop;

    if (!schoolData) {
      if (console && console.warn) {
        console.warn('no data found for ' + schoolShortName);
      }
      return;
    }

    for (prop in schoolData) {
      // only if number counts
      if (schoolData.hasOwnProperty(prop) && parseFloat(schoolData[prop])) {
        schoolData[prop] = Math.round(parseFloat(schoolData[prop]));
      }
    }

    data = {
      noontime_aides_diff: parseFloat(schoolData.fy16_investments_noontime_aides) - parseFloat(schoolData.fy16_80m_noontime_aides),
      classroom_assistants_teacher_assistants_diff: parseFloat(schoolData.fy16_investments_classroom_assistants_teacher_assistants) - parseFloat(schoolData.fy16_80m_classroom_assistants_teacher_assistants),
      counselors_diff: parseFloat(schoolData.fy16_investments_counselors) - parseFloat(schoolData.fy16_80m_counselors),
      teachers_special_education_diff: parseFloat(schoolData.fy16_investments_teachers_special_education) - parseFloat(schoolData.fy16_80m_teachers_special_education),
      teachers_diff: parseFloat(schoolData.fy16_investments_teachers) - parseFloat(schoolData.fy16_80m_teachers),
      secretaries_diff: parseFloat(schoolData.fy16_investments_secretaries) - parseFloat(schoolData.fy16_80m_secretaries),
      principals_assistant_principals_diff: parseFloat(schoolData.fy16_investments_principals_assistant_principals) - parseFloat(schoolData.fy16_80m_principals_assistant_principals),
      other_diff: parseFloat(schoolData.fy16_investments_other) - parseFloat(schoolData.fy16_80m_other),
      support_services_assistants_diff: parseFloat(schoolData.fy16_investments_support_services_assistants) - parseFloat(schoolData.fy16_80m_support_services_assistants),
      nurses_health_services_diff: parseFloat(schoolData.fy16_investments_nurses_health_services) - parseFloat(schoolData.fy16_80m_nurses_health_services),
      purchases_diff: parseFloat(schoolData.fy16_investments_purchases.replace(/\D/g,'')) - parseFloat(schoolData.fy16_80m_purchases.replace(/\D/g,''))
    };

    // Teacher increase
    data.teachers_total_diff =  data.principals_assistant_principals_diff + data.teachers_diff +
      data.teachers_special_education_diff;
    // Support staff increase
    data.support_total_diff = data.counselors_diff + data.nurses_health_services_diff +
      data.classroom_assistants_teacher_assistants_diff + data.secretaries_diff +
      data.support_services_assistants_diff + data.noontime_aides_diff + data.other_diff;
    // Supplies funds increase
    if (data.purchases_diff >= 10000) {
      data.purchases_total_diff = accounting.formatMoney(
        Math.round(data.purchases_diff / 1000)
      ) + 'K';
    } else {
      data.purchases_total_diff = accounting.formatMoney(data.purchases_diff);
    }
    data.purchases_diff = accounting.formatMoney(data.purchases_diff);

    data = $.extend(data, schoolData);

    // Render
    app.hooks.schoolList.append(Mustache.render(html, data));
  }

  function renderError () {
    // TODO Display an error message that looks nice
  }
};