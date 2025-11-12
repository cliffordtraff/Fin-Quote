import {
  getCurrentMarketSession,
  getEasternTime,
  isMarketHoliday,
  isEarlyCloseDay,
  getNextMarketOpen,
  getTimeUntilMarketOpen,
  getMarketSessionLabel,
  MARKET_HOLIDAYS_2025,
  EARLY_CLOSE_DATES_2025
} from '../lib/market-utils'

console.log('='.repeat(60))
console.log('MARKET SESSION DETECTION TEST')
console.log('='.repeat(60))

// Current time
const { hour, minute, day, date } = getEasternTime()
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

console.log('\nCurrent Time (Eastern):')
console.log(`  Date: ${date.toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`)
console.log(`  Day: ${dayNames[day]}`)
console.log(`  Time: ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ET`)

// Market session
const session = getCurrentMarketSession()
const sessionLabel = getMarketSessionLabel()

console.log('\nMarket Session:')
console.log(`  Current: ${session}`)
console.log(`  Label: ${sessionLabel}`)

// Holiday check
const isHoliday = isMarketHoliday(date)
const isEarlyClose = isEarlyCloseDay(date)

console.log('\nSpecial Market Days:')
console.log(`  Is Holiday: ${isHoliday ? 'Yes' : 'No'}`)
console.log(`  Is Early Close: ${isEarlyClose ? 'Yes (1:00 PM close)' : 'No'}`)

// Next market open
console.log('\nNext Market Open:')
console.log(`  Time until open: ${getTimeUntilMarketOpen()}`)
const nextOpen = getNextMarketOpen()
console.log(`  Next open: ${nextOpen.toLocaleString('en-US', { timeZone: 'America/New_York' })}`)

// Holiday calendar
console.log('\nMarket Holidays 2025:')
MARKET_HOLIDAYS_2025.forEach(holiday => {
  const holidayDate = new Date(holiday + 'T12:00:00')
  const dayName = dayNames[holidayDate.getDay()]
  const monthDay = holidayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  console.log(`  ${holiday} (${dayName}, ${monthDay})`)
})

console.log('\nEarly Close Dates 2025:')
EARLY_CLOSE_DATES_2025.forEach(date => {
  const closeDate = new Date(date + 'T12:00:00')
  const dayName = dayNames[closeDate.getDay()]
  const monthDay = closeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  console.log(`  ${date} (${dayName}, ${monthDay}) - Closes at 1:00 PM ET`)
})

// Session time ranges
console.log('\nSession Time Ranges:')
console.log('  Pre-Market:   4:00 AM - 9:30 AM ET')
console.log('  Regular:      9:30 AM - 4:00 PM ET (1:00 PM on early close days)')
console.log('  After-Hours:  4:00 PM - 8:00 PM ET')
console.log('  Closed:       8:00 PM - 4:00 AM ET (or any time on weekends/holidays)')

console.log('\n' + '='.repeat(60))

// Test specific times (manual verification)
console.log('\nManual Test Cases:')
console.log('To test specific times, modify the system time or wait for different sessions')
console.log('Expected behavior:')
console.log('  - Weekday 6:00 AM ET → premarket')
console.log('  - Weekday 12:00 PM ET → regular')
console.log('  - Weekday 5:00 PM ET → afterhours')
console.log('  - Weekday 10:00 PM ET → closed')
console.log('  - Saturday/Sunday → closed')
console.log('  - 2025-01-01 (New Year\'s) → closed')
console.log('  - 2025-07-03 at 2:00 PM ET → afterhours (early close day)')

console.log('\n' + '='.repeat(60))
console.log('TEST COMPLETE')
console.log('='.repeat(60))
