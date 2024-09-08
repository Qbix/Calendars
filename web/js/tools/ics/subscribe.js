(function (Q, $, window, undefined) {
var Calendars = Q.Calendars;
var calendarIcon = '<span class="Calendars_subscribe_icon">📆</span>';
/**
 * Calendars/payment tool.
 * Renders an option to make the event cost some money.
 * @class Calendars/payment
 */
Q.Tool.define("Calendars/ics/subscribe", function(options) {
    var tool = this;
    Q.Text.get('Calendars/content', function (err, content) {
        var msg = Q.firstErrorMessage(err, content);
        if (msg) {
            console.error(msg);
            return;
        }
        tool.text = content;
        tool.refresh();
    });
},

{
    onRefresh: new Q.Event()
},

{
    refresh: function () {
        var tool = this;
        var currentUserId = Q.Users.loggedInUserId();
        var subscribeLink = Q.url('/Calendars/personal/' + currentUserId + '.ics');
        var token = Q.getObject(['capability', 'Q.sig'], Q.plugins.Calendars) || null;
        var timezoneName = null;
        try {
            timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {
            // older browsers, timezoneName will be empty
        }
        var timezone = (new Date()).getTimezoneOffset() / 60;
        subscribeLink += '?' + ''.queryField({
            token: token,
            timezoneName: timezoneName,
            timezone: timezone
        });
        Q.Template.render('Calendars/ics/subscribeBtn',
            {
                text: tool.text.subscribe,
                calendarIcon: calendarIcon
            },
            function (err, html) {
                if (err) return;

                tool.element.addClass('Communities_buttons');
                Q.replace(tool.element, html);
                var subscribeBtn =  tool.element.querySelector('.Calendars_subscribe_btn');
                subscribeBtn.addEventListener('click', function (e) {
                    if(Q.info.isAndroid()) {
                        showAndroidSubscriptionInstructions();
                    } else if (Q.info.platform === 'ios') {
                        iosSubscribe();
                    } else if (Q.info.platform === 'mac') {
                        macSubscribe();
                    } else {
                        showAndroidSubscriptionInstructions();
                    }
                });
                Q.handle(tool.state.onRefresh, tool);
            }
        );

        function iosSubscribe() {
            location.href = subscribeLink.replace('https://', 'webcal://');
        }
        function macSubscribe() {
            Q.Dialogs.push({
                title: Q.getObject('subscribe.subscribeToCalendar', tool.text),
                className: 'Calendars_subscribe_dialog',
                apply: true,
                template: {
                    name: 'Calendars/ics/mac',
                    fields: {
                        subscribeLink: subscribeLink,
                        screenshotSrc: Q.url('{{Calendars}}/img/screenshots/CalendarMac.png')
                    }
                },
                onClose: function () {
                    location.href = subscribeLink.replace('https://', 'webcal://');;
                }
            });
        }
        function otherSubscribe() {
            location.href = subscribeLink.replace('https://', 'webcal://');;
        }
        function showAndroidSubscriptionInstructions() {
            step1();

            function step1() {
                Q.Dialogs.push({
                    title: Q.getObject('subscribe.subscribeToCalendar', tool.text),
                    className: 'Calendars_subscribe_dialog',
                    apply: true,
                    template: {
                        name: 'Calendars/ics/android/step1',
                        fields: {
                            subscribeLink: subscribeLink
                        }
                    },
                    onActivate: function (dialog) {
                        var copyBtn = document.querySelector('.Calendars_subscribe_url_copy');
                        var urlInput = document.querySelector('.Calendars_subscribe_url_input');
                        if(!copyBtn || !urlInput) return;
                        copyBtn.addEventListener('click', function () {
                            Q.Dialogs.pop();
                            copyToClipboard(urlInput);
                            step2();
                        });
                    }
                });
            }
            function step2() {
                Q.Dialogs.push({
                    title: Q.getObject('subscribe.subscribeToCalendar', tool.text),
                    className: 'Calendars_subscribe_dialog',
                    apply: true,
                    template: {
                        name: 'Calendars/ics/android/step2',
                        fields: {
                            subscribeLink: subscribeLink,
                            screenshotSrc: Q.url('{{Calendars}}/img/screenshots/icsImport.png')
                        }
                    },
                    onActivate: function (dialog) {
                        var goToBtn = document.querySelector('.Calendars_subscribe_open .Q_button');
                        var dialogContent = document.querySelector('.Calendars_subscribe_step2');
                        if(!goToBtn) return;
                        goToBtn.addEventListener('click', function () {
                            goToBtn.classList.add('Q_working');
                            let googleTab;

                            document.addEventListener("visibilitychange", checkSuccess);

                            googleTab = window.open('https://calendar.google.com/calendar/u/0/r/settings/addbyurl', '_blank');
                            googleTab.focus();

                            let waitCounter = 0;
                            function checkSuccess() {
                                if (document.visibilityState === "visible") {
                                    if (googleTab && googleTab.closed) {
                                        showSuccess();
                                        document.removeEventListener("visibilitychange", checkSuccess);
                                    } else if(waitCounter <= 10){
                                        //alert('asdf');
                                        waitCounter++;
                                        setTimeout(checkSuccess, 1000);
                                    }
                                } else if(waitCounter <= 10){
                                    waitCounter++;
                                    setTimeout(checkSuccess, 1000);
                                }
                            }

                            function showSuccess() {
                                if(dialogContent) dialogContent.innerHTML = '<div class="Calendars_subscribe_success">' +
                                    '<div class="Calendars_subscribe_success_text">' + tool.text.subscribe.success + '</div>' + 
                                    '<div class="Calendars_subscribe_success_ok"><span class="Q_button">OK</span></div>' + 
                                    '</div>';

                                let okBtn = document.querySelector('.Calendars_subscribe_success_ok span');
                                if(okBtn) {
                                    okBtn.addEventListener('click', function() {
                                        Q.Dialogs.pop();
                                    })
                                }
                            }
                        });
                        
                    }
                });
            }
        }
    }
});

Q.Template.set('Calendars/ics/subscribeBtn',
    '<button class="Q_button Calendars_subscribe_btn">{{{calendarIcon}}} {{text.subscribeToCalendar}}</button>'
);

Q.Template.set('Calendars/ics/android/step1',
    '<div class="Calendars_subscribe_android Calendars_subscribe_dialog_inner">' +
    '       <div>{{subscribe.' + (Q.info.isTouchscreen ? 'tapToCopy' : 'copyLinkBelow' ) + '}}' +
    '           <div class="Calendars_subscribe_url">' +
    '               <input type="hidden" value="{{subscribeLink}}" class="Calendars_subscribe_url_input" />' +
    '               <div class="Q_button Calendars_subscribe_url_copy">{{subscribe.copyLink}}</div>' +
    '           </div>' +
    '       </div>' +
    '   ' +
    '</div>'
);

Q.Template.set('Calendars/ics/android/step2',
    '<div class="Calendars_subscribe_android Calendars_subscribe_dialog_inner Calendars_subscribe_step2">' +
    '       <div class="Calendars_subscribe_instructions_step2">' +
    '           {{subscribe.step2}}' + 
    '          <div class="Calendars_subscribe_open"><span class="Q_button">Go to calendar.google.com</span></div>' + 
    '       </div>' +
    '       <div class="Calendars_subscribe_instructions_screenshot"><img src="{{screenshotSrc}}"></div>' +
    '   ' +
    '</div>'
);

Q.Template.set('Calendars/ics/mac',
    '<div class="Calendars_subscribe_ios Calendars_subscribe_dialog_inner">' +
    '   <ol class="Calendars_subscribe_instructions">' +
    '       <li>{{subscribe.calendarAppPreferences}}</li>' +
    '       <li>{{subscribe.thenCloseDialog}}</li>' +
    '   </ol>' +
    '   <img class="Calendars_instructions_screenshot" src="{{screenshotSrc}}">' +
    '</div>'
);

function copyToClipboard(el) {
    if(Q.info.platform === 'ios') {
        var oldContentEditable = el.contentEditable,
            oldReadOnly = el.readOnly,
            range = document.createRange();

        el.contentEditable = true;
        el.readOnly = false;
        range.selectNodeContents(el);

        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(range);

        el.setSelectionRange(0, 999999); // A big number, to cover anything that could be inside the element.

        el.contentEditable = oldContentEditable;
        el.readOnly = oldReadOnly;

        document.execCommand('copy');
        return;
    }
    var tempEl = document.createElement('textarea');
    tempEl.value = el.value || el.innerText;
    tempEl.setAttribute('readonly', '');
    tempEl.style.position = 'absolute';
    tempEl.style.left = '-9999px';
    document.body.appendChild(tempEl);
    var selected =
        document.getSelection().rangeCount > 0
            ? document.getSelection().getRangeAt(0)
            : false;
    tempEl.select();
    document.execCommand('copy');
    document.body.removeChild(tempEl);
    if (selected) {
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(selected);
    }
};

})(Q, Q.jQuery, window);