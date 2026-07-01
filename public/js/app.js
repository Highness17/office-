// 全局变量
let currentWeekStart = new Date();
let selectedDate = '';
let selectedStartTime = '';

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 设置起始日为今天
    setToToday();
    
    // 加载本周数据
    loadWeekData();
    
    // 事件监听
    document.getElementById('prevWeek').addEventListener('click', prevWeek);
    document.getElementById('nextWeek').addEventListener('click', nextWeek);
    document.getElementById('bookingForm').addEventListener('submit', submitBooking);
    document.getElementById('searchBtn').addEventListener('click', searchMyBookings);
    document.getElementById('closeSuccessModal').addEventListener('click', closeSuccessModal);
    document.querySelector('.close-modal').addEventListener('click', closeSuccessModal);
    
    // 时长选择变化
    document.getElementById('duration').addEventListener('change', function() {
        const customGroup = document.getElementById('customDurationGroup');
        if (this.value === 'custom') {
            customGroup.style.display = 'block';
        } else {
            customGroup.style.display = 'none';
        }
    });
    
    // 日期选择变化
    document.getElementById('bookingDate').addEventListener('change', function() {
        selectedDate = this.value;
        loadAvailableSlots(this.value);
    });
    
    // 开始时间变化
    document.getElementById('startTime').addEventListener('change', function() {
        selectedStartTime = this.value;
    });
});

// 设置起始日为今天
function setToToday() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    // 如果今天是周末（周六或周日），则跳到下周一
    if (dayOfWeek === 0) {
        // 周日 -> 跳到下周一
        today.setDate(today.getDate() + 1);
    } else if (dayOfWeek === 6) {
        // 周六 -> 跳到下周一
        today.setDate(today.getDate() + 2);
    }
    
    currentWeekStart = today;
    updateWeekRange();
}

// 更新周范围显示
function updateWeekRange() {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    
    const startStr = formatDate(currentWeekStart);
    const endStr = formatDate(weekEnd);
    
    document.getElementById('weekRange').textContent = `${startStr} 至 ${endStr}`;
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 格式化日期为中文显示
function formatDateCN(dateStr) {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const dayName = days[date.getDay()];
    return `${month}月${day}日 (周${dayName})`;
}

// 上一周
function prevWeek() {
    // 检查是否已经是当前周（不允许查看过去的时间）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const minDate = new Date(today);
    const dayOfWeek = minDate.getDay();
    if (dayOfWeek === 0) {
        minDate.setDate(today.getDate() + 1);
    } else if (dayOfWeek === 6) {
        minDate.setDate(today.getDate() + 2);
    }
    
    if (currentWeekStart <= minDate) {
        alert('无法查看过去的时间');
        return;
    }
    
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    updateWeekRange();
    loadWeekData();
}

// 下一周
function nextWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    updateWeekRange();
    loadWeekData();
}

// 加载本周数据
async function loadWeekData() {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    
    const startDate = formatDate(currentWeekStart);
    const endDate = formatDate(weekEnd);
    
    try {
        // 加载行程数据
        const scheduleResp = await fetch(`/api/schedule/week?start_date=${startDate}&end_date=${endDate}`);
        const scheduleData = await scheduleResp.json();
        
        // 加载预约数据
        const bookingResp = await fetch(`/api/bookings/week?start_date=${startDate}&end_date=${endDate}`);
        const bookingData = await bookingResp.json();
        
        if (scheduleData.success && bookingData.success) {
            renderWeekView(scheduleData.data, bookingData.data);
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        alert('加载数据失败，请刷新页面重试');
    }
}

// 渲染周视图
function renderWeekView(schedules, bookings) {
    const container = document.getElementById('timeSlots');
    container.innerHTML = '';
    
    // 获取今天（用于跳过过去的时间）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 生成日期（最多7天，但跳过周末和过去的日期）
    let dayCount = 0;
    let i = 0;
    
    while (dayCount < 7 && i < 14) {  // 最多检查14天，避免无限循环
        const currentDate = new Date(currentWeekStart);
        currentDate.setDate(currentWeekStart.getDate() + i);
        
        const dateStr = formatDate(currentDate);
        const dayOfWeek = currentDate.getDay();
        
        // 跳过周末
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            i++;
            continue;
        }
        
        // 跳过过去的日期
        if (currentDate < today) {
            i++;
            continue;
        }
        
        // 显示该日
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        
        // 日期标题
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.innerHTML = `
            <span class="day-name">${formatDateCN(dateStr)}</span>
            <span class="day-date">${dateStr}</span>
        `;
        dayColumn.appendChild(dayHeader);
        
        // 获取当天的占用时间段
        const daySchedules = schedules.filter(s => s.event_date === dateStr);
        const dayBookings = bookings.filter(b => b.booking_date === dateStr);
        
        // 生成时间槽
        const timeSlots = generateTimeSlots(dateStr, daySchedules, dayBookings);
        timeSlots.forEach(slot => {
            const slotElem = document.createElement('div');
            slotElem.className = `time-slot ${slot.status}`;
            slotElem.innerHTML = `
                <span class="slot-time">${slot.startTime} - ${slot.endTime}</span>
                <span class="slot-status">${slot.statusText}</span>
            `;
            
            // 可预约的时间槽可以点击
            if (slot.status === 'available') {
                slotElem.addEventListener('click', () => selectTimeSlot(dateStr, slot.startTime, slot.endTime));
            }
            
            dayColumn.appendChild(slotElem);
        });
        
        container.appendChild(dayColumn);
        
        dayCount++;
        i++;
    }
    
    // 如果没有可显示的日子，提示用户
    if (dayCount === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 30px;">暂无可用的工作日，请点击"下周"查看未来时间</p>';
    }
}

// 生成时间槽
function generateTimeSlots(dateStr, daySchedules, dayBookings) {
    const slots = [];
    
    // 定义工作时间段
    const workPeriods = [
        { start: '08:00', end: '12:00' },
        { start: '14:00', end: '17:00' }
    ];
    
    // 将所有占用时间合并（包括固定早交班会时间）
    const occupiedSlots = [
        ...daySchedules.map(s => ({ start: s.start_time, end: s.end_time })),
        ...dayBookings.map(b => ({ start: b.start_time, end: b.end_time }))
    ];
    
    // 添加固定早交班会时间 8:00-8:30（工作日）
    const dayOfWeek = new Date(dateStr).getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        occupiedSlots.push({ start: '08:00', end: '08:30' });
    }
    
    // 生成每10分钟的槽（更精细的粒度）
    for (const period of workPeriods) {
        let currentTime = period.start;
        
        while (currentTime < period.end) {
            const [hours, minutes] = currentTime.split(':').map(Number);
            let endHours = hours;
            let endMinutes = minutes + 10;  // 改为10分钟粒度
            
            if (endMinutes >= 60) {
                endHours += 1;
                endMinutes -= 60;
            }
            
            const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
            
            // 检查是否被占用（完全占用才标记为不可用）
            const isOccupied = occupiedSlots.some(slot => {
                return timeToMinutes(slot.start) < timeToMinutes(endTime) && 
                       timeToMinutes(slot.end) > timeToMinutes(currentTime);
            });
            
            let status = 'available';
            let statusText = '可预约';
            
            if (isOccupied) {
                // 判断是预约还是其他占用
                const isBooked = dayBookings.some(b => {
                    return timeToMinutes(b.start_time) < timeToMinutes(endTime) && 
                           timeToMinutes(b.end_time) > timeToMinutes(currentTime);
                });
                
                if (isBooked) {
                    status = 'booked';
                    statusText = '已预约';
                } else {
                    status = 'occupied';
                    statusText = '已占用';
                }
            }
            
            slots.push({
                startTime: currentTime,
                endTime: endTime,
                status: status,
                statusText: statusText
            });
            
            // 移动到下一个10分钟
            currentTime = endTime;
        }
    }
    
    return slots;
}

// 时间转分钟数（用于时间比较）
function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// 选择时间段
function selectTimeSlot(date, startTime, endTime) {
    selectedDate = date;
    selectedStartTime = startTime;
    
    // 填充表单
    document.getElementById('bookingDate').value = date;
    document.getElementById('startTime').value = startTime;
    
    // 计算默认时长
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    
    // 滚动到表单
    document.querySelector('.right-panel').scrollIntoView({ behavior: 'smooth' });
    
    alert(`已选择 ${formatDateCN(date)} ${startTime} 时间段，请在右侧填写预约信息`);
}

// 加载可用时间段
async function loadAvailableSlots(date) {
    try {
        const response = await fetch(`/api/available-slots?date=${date}`);
        const data = await response.json();
        
        if (data.success) {
            // 可以在这里更新可用时间段的显示
            console.log('可用时间段:', data.data);
        }
    } catch (error) {
        console.error('加载可用时间段失败:', error);
    }
}

// 提交预约
async function submitBooking(e) {
    e.preventDefault();
    
    const bookerName = document.getElementById('bookerName').value;
    const department = document.getElementById('department').value;
    const bookingDate = document.getElementById('bookingDate').value;
    const startTime = document.getElementById('startTime').value;
    const durationSelect = document.getElementById('duration');
    let duration = durationSelect.value;
    
    if (duration === 'custom') {
        duration = document.getElementById('customDuration').value;
    }
    
    const reason = document.getElementById('reason').value;
    
    // 计算结束时间
    const [startH, startM] = startTime.split(':').map(Number);
    const endMinutes = startH * 60 + startM + parseInt(duration);
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    
    // 验证
    if (!bookerName || !bookingDate || !startTime || !duration) {
        alert('请填写必填项');
        return;
    }
    
    try {
        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                booker_name: bookerName,
                department: department,
                booking_date: bookingDate,
                start_time: startTime,
                end_time: endTime,
                duration: parseInt(duration),
                reason: reason
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 显示成功弹窗
            document.getElementById('successMessage').textContent = 
                `您已成功预约 ${formatDateCN(bookingDate)} ${startTime} 的面谈时间，请准时前往。`;
            document.getElementById('successModal').classList.add('active');
            
            // 重置表单
            document.getElementById('bookingForm').reset();
            document.getElementById('customDurationGroup').style.display = 'none';
            
            // 重新加载数据
            loadWeekData();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('提交预约失败:', error);
        alert('提交预约失败，请重试');
    }
}

// 关闭成功弹窗
function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('active');
}

// 查询我的预约
async function searchMyBookings() {
    const name = document.getElementById('searchName').value;
    
    if (!name) {
        alert('请输入姓名');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/bookings`);
        const data = await response.json();
        
        if (data.success) {
            // 过滤出该用户的预约
            const myBookings = data.data.filter(b => b.booker_name === name);
            renderMyBookings(myBookings);
        }
    } catch (error) {
        console.error('查询预约失败:', error);
        alert('查询失败，请重试');
    }
}

// 渲染我的预约列表
function renderMyBookings(bookings) {
    const container = document.getElementById('myBookingsList');
    container.innerHTML = '';
    
    if (bookings.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">暂无预约记录</p>';
        return;
    }
    
    bookings.forEach(booking => {
        const bookingElem = document.createElement('div');
        bookingElem.className = 'booking-item';
        
        const bookingDate = new Date(booking.booking_date + 'T' + booking.start_time);
        const canCancel = bookingDate > new Date() && booking.status === 'active';
        
        bookingElem.innerHTML = `
            <div class="booking-header">
                <span class="booking-name">${booking.booker_name} (${booking.department || '未填写科室'})</span>
                <span class="booking-status">${booking.status === 'active' ? '有效' : '已取消'}</span>
            </div>
            <div class="booking-details">
                <p>日期: ${booking.booking_date}</p>
                <p>时间: ${booking.start_time} - ${booking.end_time} (${booking.duration}分钟)</p>
                ${booking.reason ? `<p>事项: ${booking.reason}</p>` : ''}
                <p>预约时间: ${new Date(booking.created_at).toLocaleString('zh-CN')}</p>
            </div>
            ${canCancel ? `<button class="btn-cancel" onclick="cancelBooking(${booking.id}, '${booking.booker_name}')">取消预约</button>` : ''}
        `;
        
        container.appendChild(bookingElem);
    });
}

// 取消预约
async function cancelBooking(id, bookerName) {
    if (!confirm('确定要取消这个预约吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/bookings/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ booker_name: bookerName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('预约已取消');
            searchMyBookings(); // 重新加载
            loadWeekData(); // 重新加载周数据
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('取消预约失败:', error);
        alert('取消失败，请重试');
    }
}
