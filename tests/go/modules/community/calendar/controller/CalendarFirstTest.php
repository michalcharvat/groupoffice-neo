<?php

namespace go\modules\community\calendar\controller;

use go\core\auth\TemporaryState;
use go\core\model\User;
use go\modules\community\addressbook\model\Contact;
use go\modules\community\calendar\model\Calendar as CalendarModel;
use PHPUnit\Framework\TestCase;

/**
 * Calendar/first creates the personal calendar of a user who has none ("Create personal calendar"
 * when there are no writeable calendars). It saves the user, so it needs the whole user, not some
 * properties. The test DB has no module that changes the profile contact on load, which is when
 * saving a partly loaded user failed ("Typed property User::$email must not be accessed"), so it
 * covers the flow, not that crash.
 */
class CalendarFirstTest extends TestCase
{
	public function testCreatesThePersonalCalendarOfAUserWithoutOne(): void
	{
		$user = new User();
		$user->username = 'calfirsttest' . uniqid();
		$user->displayName = 'Calendar First Test';
		$user->email = $user->username . '@example.invalid';
		$user->setPassword('Pa55word!!' . uniqid());
		$this->assertTrue($user->save());

		$profileId = Contact::find()->selectSingleValue('id')->where(['goUserId' => $user->id])->single();

		$authState = go()->getAuthState();
		try {
			// a user without a calendar, like users created before the calendar module was installed
			CalendarModel::delete(['ownerId' => $user->id]);

			go()->setAuthState(new TemporaryState($user->id));
			$result = (new Calendar())->first([]);

			$this->assertNotEmpty($result['calendarId']);
			$calendar = CalendarModel::findById($result['calendarId']);
			$this->assertEquals($user->id, $calendar->getOwnerId());

			$prefs = User::findById($user->id, ['calendarPreferences'])->calendarPreferences;
			$this->assertEquals($result['calendarId'], $prefs->defaultCalendarId);
		} finally {
			go()->setAuthState($authState);
			CalendarModel::delete(['ownerId' => $user->id]);
			User::delete(['id' => $user->id]);
			// deleting the user keeps its profile contact
			$profileId && Contact::delete(['id' => $profileId]);
		}
	}
}
