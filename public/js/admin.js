// 全局变量
let isLoggedIn = false;
let allBookings = [];

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否已登录
    const savedLogin = localStorage.getItem('adminLoggedIn');
    if (savedLogin === 'true') {
        showAdminPanel();
    }
    
    // 事件监听
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('filterBtn').addEventListener('click', filterByDate);
    document.getElementById('clearFilterBtn').addEventListener('click', clearFilter);
    document.getElementById('syncBtn').addEventListener('click', syncSchedule);
    
    // 视图切换
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const view = this.getAttribute('data-view');
            if (view === 'week') {
                loadWeekBookings();
            } else {
                loadAllBookings();
            }
        });
    });
});

// 处理登录
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('adminLoggedIn', 'true');
            showAdminPanel();
            loadWeekBookings(); // 默认加载本周数据
        } else {
            alert('登录失败: ' + data.message);
        }
    } catch (error) {
        console.error('登录失败:', error);
        alert('登录失败，请检查网络连接');
    }
}

// 显示管理面板
function showAdminPanel() {
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    isLoggedIn = true;
}

// 处理退出登录
function handleLogout() {
    localStorage.removeItem('adminLoggedIn');
    document.getElementById('loginPanel').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
    isLoggedIn = false;
    
    // 清空表单
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

// 加载本周预约
async function loadWeekBookings() {
    if (!isLoggedIn) return;
    
    try {
        const response = await fetch('/api/bookings/week');
        const data = await response.json();
        
        if (data.success) {
            allBookings = data.data;
            renderBookingsTable(allBookings);
            updateStats(allBookings);
        }
    } catch (error) {
        console.error('加载本周预约失败:', error);
        alert('加载数据失败，请刷新页面');
    }
}

// 加载全部预约
async function loadAllBookings() {
    if (!isLoggedIn) return;
    
    try {
        const response = await fetch('/api/admin/bookings');
        const data = await response.json();
        
        if (data.success) {
            allBookings = data.data;
            renderBookingsTable(allBookings);
            updateStats(allBookings);
        }
    } catch (error) {
        console.error('加载全部预约失败:', error);
        alert('加载数据失败，请刷新页面');
    }
}

// 渲染预约表格
function renderBookingsTable(bookings) {
    const tbody = document.getElementById('bookingsTableBody');
    tbody.innerHTML = '';
    
    if (bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: #999;">暂无预约记录</td></tr>';
        return;
    }
    
    bookings.forEach(booking => {
        const row = document.createElement('tr');
        
        // 状态显示
        let statusText = '';
        let statusClass = '';
        if (booking.status === 'active') {
            statusText = '有效';
            statusClass = 'status-active';
        } else if (booking.status === 'cancelled') {
            statusText = '已取消';
            statusClass = 'status-cancelled';
        } else {
            statusText = booking.status;
            statusClass = 'status-completed';
        }
        
        row.innerHTML = `
            <td>${booking.booker_name}</td>
            <td>${booking.department || '-'}</td>
            <td>${booking.booking_date}</td>
            <td>${booking.start_time} - ${booking.end_time}</td>
            <td>${booking.duration}分钟</td>
            <td>${booking.reason || '-'}</td>
            <td>${new Date(booking.created_at).toLocaleString('zh-CN')}</td>
            <td class="${statusClass}">${statusText}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// 更新统计
function updateStats(bookings) {
    // 总预约数
    document.getElementById('totalBookings').textContent = bookings.length;
    
    // 今日预约
    const today = new Date().toISOString().split('T')[0];
    const todayCount = bookings.filter(b => b.booking_date === today && b.status === 'active').length;
    document.getElementById('todayBookings').textContent = todayCount;
    
    // 本周预约
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    const weekCount = bookings.filter(b => {
        const bookingDate = new Date(b.booking_date);
        return bookingDate >= weekStart && bookingDate <= weekEnd && b.status === 'active';
    }).length;
    document.getElementById('weekBookings').textContent = weekCount;
}

// 按日期筛选
function filterByDate() {
    const filterDate = document.getElementById('filterDate').value;
    
    if (!filterDate) {
        alert('请选择日期');
        return;
    }
    
    // 加载指定日期的预约
    fetch(`/api/admin/bookings?date=${filterDate}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderBookingsTable(data.data);
                updateStats(data.data);
            }
        })
        .catch(error => {
            console.error('筛选失败:', error);
            alert('筛选失败，请重试');
        });
}

// 清除筛选
function clearFilter() {
    document.getElementById('filterDate').value = '';
    
    // 回到当前视图
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab.getAttribute('data-view') === 'week') {
        loadWeekBookings();
    } else {
        loadAllBookings();
    }
}

// 同步行程
async function syncSchedule() {
    const scheduleDataStr = document.getElementById('scheduleData').value;
    
    if (!scheduleDataStr) {
        alert('请粘贴行程数据');
        return;
    }
    
    try {
        const schedules = JSON.parse(scheduleDataStr);
        
        if (!Array.isArray(schedules)) {
            alert('数据格式错误，请输入JSON数组');
            return;
        }
        
        const response = await fetch('/api/schedule/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ schedules })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('同步成功！' + data.message);
            document.getElementById('scheduleData').value = '';
            
            // 重新加载数据
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab.getAttribute('data-view') === 'week') {
                loadWeekBookings();
            }
        } else {
            alert('同步失败: ' + data.message);
        }
    } catch (error) {
        console.error('同步失败:', error);
        if (error instanceof SyntaxError) {
            alert('JSON格式错误，请检查输入');
        } else {
            alert('同步失败，请重试');
        }
    }
}
