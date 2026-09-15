import { StaffUser } from '../types';

/**
 * Parses a 24-hour time string (e.g. '07:30', '19:00', '7:30') into total minutes since midnight.
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  return (isNaN(hours) ? 0 : hours) * 60 + (isNaN(minutes) ? 0 : minutes);
}

/**
 * Formats a 24-hour time string ('HH:MM') to 12-hour display ('h:mm AM/PM').
 * Example: '07:30' -> '7:30 AM', '19:00' -> '7:00 PM', '00:00' -> '12:00 AM'.
 */
export function formatTime12Hour(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.trim().split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  if (isNaN(hours)) hours = 0;
  const safeMinutes = isNaN(minutes) ? 0 : minutes;

  const ampm = hours >= 12 ? 'PM' : 'AM';
  let displayHour = hours % 12;
  if (displayHour === 0) displayHour = 12;
  const displayMinutes = safeMinutes < 10 ? `0${safeMinutes}` : `${safeMinutes}`;

  return `${displayHour}:${displayMinutes} ${ampm}`;
}

/**
 * Checks whether the specified current date/time falls within the authorized window.
 * Supports standard daytime shifts (e.g. 07:30 to 19:00) and overnight shifts (e.g. 21:00 to 06:00).
 */
export function isWithinWorkingHours(
  workStartTime: string = '07:30',
  workEndTime: string = '19:00',
  now: Date = new Date()
): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(workStartTime);
  const endMinutes = parseTimeToMinutes(workEndTime);

  // Standard daytime shift
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // Overnight shift spanning past midnight (e.g. 20:00 to 06:00)
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

/**
 * Validates a staff member's working hours access.
 * Rule: Staff with role 'Owner' are always exempt from restrictions.
 */
export function checkStaffWorkingHoursAccess(
  staff: StaffUser,
  now: Date = new Date()
): { allowed: boolean; reason?: string; formattedWindow?: string } {
  // Staff with role 'Owner' should always be exempt
  if (staff.role === 'Owner') {
    return {
      allowed: true,
      formattedWindow: '24/7 Access (Owner Exempt)',
    };
  }

  // If working hours restrictions are not enabled, allow login 24/7
  if (!staff.restrictWorkingHours) {
    return {
      allowed: true,
      formattedWindow: '24/7 Access',
    };
  }

  const startTime = staff.workStartTime?.trim() || '07:30';
  const endTime = staff.workEndTime?.trim() || '19:00';

  const startFormatted = formatTime12Hour(startTime);
  const endFormatted = formatTime12Hour(endTime);
  const formattedWindow = `${startFormatted} – ${endFormatted}`;

  const isAllowed = isWithinWorkingHours(startTime, endTime, now);

  if (!isAllowed) {
    return {
      allowed: false,
      formattedWindow,
      reason: `Access denied: Login is not permitted outside authorized working hours (${formattedWindow}). Please contact the store administrator.`,
    };
  }

  return {
    allowed: true,
    formattedWindow,
  };
}
