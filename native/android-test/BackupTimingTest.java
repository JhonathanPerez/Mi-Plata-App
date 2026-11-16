package __PACKAGE__;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Calendar;
import java.util.TimeZone;
import org.junit.Test;

public class BackupTimingTest {

    private static final TimeZone UTC = TimeZone.getTimeZone("UTC");

    private static long atUtc(int year, int month, int day, int hour, int minute, int second) {
        Calendar value = Calendar.getInstance(UTC);
        value.clear();
        value.set(year, month - 1, day, hour, minute, second);
        return value.getTimeInMillis();
    }

    @Test public void doesNotRunBeforeConfiguredTime() {
        long before = atUtc(2026, 11, 16, 7, 59, 59);
        assertFalse(BackupTiming.isDue(null, before, UTC, 1, 8, 0));
    }

    @Test public void runsAtConfiguredTimeWhenFirstBackupIsPending() {
        long scheduled = atUtc(2026, 11, 16, 8, 0, 0);
        assertTrue(BackupTiming.isDue(null, scheduled, UTC, 1, 8, 0));
    }

    @Test public void doesNotRunTwiceOnSameCalendarDay() {
        long lastSuccess = atUtc(2026, 11, 16, 8, 0, 0);
        long laterToday = atUtc(2026, 11, 16, 12, 0, 0);
        assertFalse(BackupTiming.isDue(lastSuccess, laterToday, UTC, 1, 8, 0));
    }

    @Test public void runsAfterConfiguredDayInterval() {
        long lastSuccess = atUtc(2026, 11, 9, 8, 0, 0);
        long due = atUtc(2026, 11, 16, 8, 0, 0);
        assertTrue(BackupTiming.isDue(lastSuccess, due, UTC, 7, 8, 0));
    }

    @Test public void earlyWakeupCanBeRescheduledForSameDay() {
        long before = atUtc(2026, 11, 16, 7, 59, 30);
        long expected = atUtc(2026, 11, 16, 8, 0, 0);
        assertEquals(expected - before, BackupTiming.millisUntilNext(before, UTC, 8, 0));
    }

    @Test public void exactScheduledInstantMovesToTomorrowWhenSchedulingNextRun() {
        long now = atUtc(2026, 11, 16, 8, 0, 0);
        long tomorrow = atUtc(2026, 11, 17, 8, 0, 0);
        assertEquals(tomorrow - now, BackupTiming.millisUntilNext(now, UTC, 8, 0));
    }

    @Test public void rejectsInvalidScheduleValues() {
        assertFalse(BackupTiming.isDue(null, atUtc(2026, 11, 16, 8, 0, 0), UTC, 0, 8, 0));
        assertFalse(BackupTiming.isDue(null, atUtc(2026, 11, 16, 8, 0, 0), UTC, 1, 24, 0));
        assertEquals(null, BackupTiming.parseTime("24:00"));
        assertEquals(null, BackupTiming.parseTime("8:00"));
    }
}
