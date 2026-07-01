const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// 数据文件路径
const DATA_DIR = path.join(__dirname, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');

// 确保数据目录和文件存在
initDataFiles();

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 数据初始化 ====================
function initDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(BOOKINGS_FILE)) {
        fs.writeFileSync(BOOKINGS_FILE, JSON.stringify([], null, 2));
    }
    
    if (!fs.existsSync(SCHEDULE_FILE)) {
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify([], null, 2));
    }
    
    if (!fs.existsSync(ADMINS_FILE)) {
        fs.writeFileSync(ADMINS_FILE, JSON.stringify([
            { id: 1, username: 'admin', password: 'admin123' }
        ], null, 2));
    }
}

// 读取数据
function readData(file) {
    try {
        const data = fs.readFileSync(file, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取数据失败:', error);
        return [];
    }
}

// 写入数据
function writeData(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('写入数据失败:', error);
        return false;
    }
}

// 生成新ID
function generateId(data) {
    if (data.length === 0) return 1;
    return Math.max(...data.map(item => item.id)) + 1;
}

// 时间转分钟数（用于时间比较）
function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// ==================== API 接口 ====================

// 获取本周领导行程（已占用时间）
app.get('/api/schedule/week', (req, res) => {
    const { start_date, end_date } = req.query;
    
    let schedules = readData(SCHEDULE_FILE);
    
    if (start_date && end_date) {
        schedules = schedules.filter(s => s.event_date >= start_date && s.event_date <= end_date);
    }
    
    // 添加固定早交班会时间 8:00-8:30（工作日）
    if (start_date) {
        const startDate = new Date(start_date);
        const endDate = end_date ? new Date(end_date) : new Date(start_date);
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            // 只添加工作日（周一到周五）
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                const dateStr = d.toISOString().split('T')[0];
                // 检查是否已有8:00-8:30的行程
                const hasZaochao = schedules.some(s => 
                    s.event_date === dateStr && 
                    s.start_time <= '08:30' && 
                    s.end_time >= '08:00'
                );
                
                if (!hasZaochao) {
                    schedules.push({
                        id: 0,
                        event_date: dateStr,
                        start_time: '08:00',
                        end_time: '08:30',
                        event_name: '早交班会（固定）',
                        synced_at: null
                    });
                }
            }
        }
    }
    
    res.json({ success: true, data: schedules });
});

// 获取本周预约记录
app.get('/api/bookings/week', (req, res) => {
    const { start_date, end_date } = req.query;
    
    let bookings = readData(BOOKINGS_FILE);
    bookings = bookings.filter(b => b.status === 'active');
    
    if (start_date && end_date) {
        bookings = bookings.filter(b => b.booking_date >= start_date && b.booking_date <= end_date);
    } else {
        // 默认返回本周
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        const startDate = weekStart.toISOString().split('T')[0];
        const endDate = weekEnd.toISOString().split('T')[0];
        
        bookings = bookings.filter(b => b.booking_date >= startDate && b.booking_date <= endDate);
    }
    
    res.json({ success: true, data: bookings });
});

// 提交预约
app.post('/api/bookings', (req, res) => {
    const { booker_name, department, booking_date, start_time, end_time, duration, reason } = req.body;
    
    // 验证必填项
    if (!booker_name || !booking_date || !start_time || !end_time) {
        return res.json({ success: false, message: '预约人姓名、日期、时间为必填项' });
    }
    
    // 检查是否工作日 (1-5 为工作日)
    const dayOfWeek = new Date(booking_date).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return res.json({ success: false, message: '只能在工作日预约' });
    }
    
    // 检查是否在工作时间范围内
    const startHour = parseInt(start_time.split(':')[0]);
    const endHour = parseInt(end_time.split(':')[0]);
    const endMinute = parseInt(end_time.split(':')[1]);
    
    const isAmValid = (startHour >= 8 && (endHour < 12 || (endHour === 12 && endMinute === 0)));
    const isPmValid = (startHour >= 14 && (endHour < 17 || (endHour === 17 && endMinute === 0)));
    
    if (!isAmValid && !isPmValid) {
        return res.json({ success: false, message: '预约时间必须在工作时间内（上午08:00-12:00，下午14:00-17:00）' });
    }
    
    // 检查是否与早交班会时间冲突（8:00-8:30）
    const bookingStartMinutes = timeToMinutes(start_time);
    const bookingEndMinutes = timeToMinutes(end_time);
    const zaochaoStart = 8 * 60;  // 8:00 = 480分钟
    const zaochaoEnd = 8 * 60 + 30;  // 8:30 = 510分钟
    
    if (bookingStartMinutes < zaochaoEnd && bookingEndMinutes > zaochaoStart) {
        return res.json({ success: false, message: '8:00-8:30为早交班会固定时间，不支持预约' });
    }
    
    let bookings = readData(BOOKINGS_FILE);
    let schedules = readData(SCHEDULE_FILE);
    
    // 检查时间冲突：与已有行程冲突
    const conflicts = schedules.filter(s => {
        return s.event_date === booking_date && 
               !(end_time <= s.start_time || start_time >= s.end_time);
    });
    
    if (conflicts.length > 0) {
        return res.json({ success: false, message: '该时间段与领导已有行程冲突，请选择其他时间' });
    }
    
    // 检查时间冲突：与已有预约冲突
    const bookingConflicts = bookings.filter(b => {
        return b.status === 'active' && 
               b.booking_date === booking_date && 
               !(end_time <= b.start_time || start_time >= b.end_time);
    });
    
    if (bookingConflicts.length > 0) {
        return res.json({ success: false, message: '该时间段已被预约，请选择其他时间' });
    }
    
    // 插入预约记录
    const newBooking = {
        id: generateId(bookings),
        booker_name,
        department: department || '',
        booking_date,
        start_time,
        end_time,
        duration: parseInt(duration),
        reason: reason || '',
        created_at: new Date().toISOString(),
        status: 'active'
    };
    
    bookings.push(newBooking);
    writeData(BOOKINGS_FILE, bookings);
    
    res.json({ success: true, message: '预约成功', data: { id: newBooking.id } });
});

// 取消预约
app.delete('/api/bookings/:id', (req, res) => {
    const { id } = req.params;
    const { booker_name } = req.body;
    
    let bookings = readData(BOOKINGS_FILE);
    
    const bookingIndex = bookings.findIndex(b => b.id === parseInt(id));
    
    if (bookingIndex === -1) {
        return res.json({ success: false, message: '预约记录不存在' });
    }
    
    const booking = bookings[bookingIndex];
    
    if (booking.booker_name !== booker_name) {
        return res.json({ success: false, message: '只能取消本人预约' });
    }
    
    // 检查是否已开始
    const bookingDateTime = new Date(booking.booking_date + 'T' + booking.start_time);
    if (bookingDateTime < new Date()) {
        return res.json({ success: false, message: '无法取消已开始的预约' });
    }
    
    // 更新状态为取消
    bookings[bookingIndex].status = 'cancelled';
    writeData(BOOKINGS_FILE, bookings);
    
    res.json({ success: true, message: '预约已取消' });
});

// 管理员登录
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    const admins = readData(ADMINS_FILE);
    const admin = admins.find(a => a.username === username && a.password === password);
    
    if (admin) {
        res.json({ success: true, message: '登录成功', data: { username: admin.username } });
    } else {
        res.json({ success: false, message: '用户名或密码错误' });
    }
});

// 管理员：获取所有预约记录
app.get('/api/admin/bookings', (req, res) => {
    const { date } = req.query;
    
    let bookings = readData(BOOKINGS_FILE);
    
    if (date) {
        bookings = bookings.filter(b => b.booking_date === date);
    }
    
    // 按日期和时间排序
    bookings.sort((a, b) => {
        if (a.booking_date !== b.booking_date) {
            return a.booking_date.localeCompare(b.booking_date);
        }
        return a.start_time.localeCompare(b.start_time);
    });
    
    res.json({ success: true, data: bookings });
});

// 同步金山文档行程（API接口）
app.post('/api/schedule/sync', (req, res) => {
    const { schedules } = req.body;
    
    if (!Array.isArray(schedules)) {
        return res.json({ success: false, message: '数据格式错误' });
    }
    
    // 保留历史数据（可选）
    // 这里简单处理：直接替换所有数据
    const schedulesWithMeta = schedules.map((s, index) => ({
        id: index + 1,
        event_date: s.event_date,
        start_time: s.start_time,
        end_time: s.end_time,
        event_name: s.event_name || '领导行程',
        synced_at: new Date().toISOString()
    }));
    
    writeData(SCHEDULE_FILE, schedulesWithMeta);
    
    res.json({ success: true, message: `成功同步 ${schedules.length} 条行程记录` });
});

// 获取可用时间段（计算可用时间）
app.get('/api/available-slots', (req, res) => {
    const { date } = req.query;
    
    if (!date) {
        return res.json({ success: false, message: '请指定日期' });
    }
    
    let schedules = readData(SCHEDULE_FILE);
    let bookings = readData(BOOKINGS_FILE);
    
    // 获取当天所有占用时间段（行程 + 预约 + 早交班会）
    const daySchedules = schedules
        .filter(s => s.event_date === date)
        .map(s => ({ start: s.start_time, end: s.end_time }));
    
    const dayBookings = bookings
        .filter(b => b.status === 'active' && b.booking_date === date)
        .map(b => ({ start: b.start_time, end: b.end_time }));
    
    // 添加固定早交班会时间 8:00-8:30（工作日）
    const dayOfWeek = new Date(date).getDay();
    const fixedBlocks = [];
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        fixedBlocks.push({ start: '08:00', end: '08:30' });
    }
    
    const occupiedSlots = [...daySchedules, ...dayBookings, ...fixedBlocks];
    
    // 定义工作时间段
    const workPeriods = [
        { start: '08:00', end: '12:00' },
        { start: '14:00', end: '17:00' }
    ];
    
    // 计算可用时间段（精细到10分钟）
    const availableSlots = [];
    
    for (const period of workPeriods) {
        // 收集当前时段内的所有占用
        const periodOccupied = occupiedSlots.filter(slot => {
            const slotStart = timeToMinutes(slot.start);
            const slotEnd = timeToMinutes(slot.end);
            const periodStart = timeToMinutes(period.start);
            const periodEnd = timeToMinutes(period.end);
            
            return slotStart < periodEnd && slotEnd > periodStart;
        });
        
        // 按开始时间排序
        periodOccupied.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        
        // 计算可用间隙
        let pointer = period.start;
        
        for (const occ of periodOccupied) {
            if (timeToMinutes(occ.start) > timeToMinutes(pointer)) {
                // 有可用间隙
                let currentTime = pointer;
                while (timeToMinutes(currentTime) < timeToMinutes(occ.start)) {
                    const [hours, minutes] = currentTime.split(':').map(Number);
                    let endHours = hours;
                    let endMinutes = minutes + 10;
                    
                    if (endMinutes >= 60) {
                        endHours += 1;
                        endMinutes -= 60;
                    }
                    
                    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
                    
                    if (timeToMinutes(endTime) <= timeToMinutes(occ.start)) {
                        availableSlots.push({
                            start: currentTime,
                            end: endTime
                        });
                    }
                    
                    currentTime = endTime;
                }
            }
            
            // 移动指针到占用结束时间
            if (timeToMinutes(occ.end) > timeToMinutes(pointer)) {
                pointer = occ.end;
            }
        }
        
        // 最后一段可用时间
        if (timeToMinutes(pointer) < timeToMinutes(period.end)) {
            let currentTime = pointer;
            while (timeToMinutes(currentTime) < timeToMinutes(period.end)) {
                const [hours, minutes] = currentTime.split(':').map(Number);
                let endHours = hours;
                let endMinutes = minutes + 10;
                
                if (endMinutes >= 60) {
                    endHours += 1;
                    endMinutes -= 60;
                }
                
                const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
                
                if (timeToMinutes(currentTime) < timeToMinutes(period.end)) {
                    availableSlots.push({
                        start: currentTime,
                        end: endTime
                    });
                }
                
                currentTime = endTime;
            }
        }
    }
    
    res.json({ success: true, data: availableSlots });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`领导面谈预约系统已启动：http://localhost:${PORT}`);
    console.log(`- 用户预约页面：http://localhost:${PORT}`);
    console.log(`- 管理员登录：http://localhost:${PORT}/admin.html`);
    console.log(`- 默认管理员账号：admin / admin123`);
});
