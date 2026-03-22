document.addEventListener('alpine:init', () => {
    const pb = new PocketBase(window.location.origin);

    function toISO(date) {
        return new Date(date).toLocaleDateString('en-CA');
    }

    function addDays(date, n) {
        const d = new Date(date);
        d.setDate(d.getDate() + n);
        return d;
    }

    function getWeekStart(baseDate, offsetWeeks = 0) {
        const d = new Date(baseDate);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - d.getDay() + offsetWeeks * 7);
        return d;
    }

    function allocateBlocks(task) {
        const blocks = [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const startHour = task.preferred_start_time
            ? parseInt(task.preferred_start_time.split(':')[0])
            : 9;

        if (task.is_recurring) {
            const sessionHrs = parseFloat(task.rec_session_len) || 3;
            const weeklyHrs  = parseFloat(task.weekly_hours) || 6;
            const sessionsPerWeek = Math.max(1, Math.ceil(weeklyHrs / sessionHrs));

            const endDate = task.recurrence_end
                ? new Date(task.recurrence_end + 'T23:59:59')
                : new Date('2099-12-31');

            let weekStart = getWeekStart(now);

            const dayPattern = [1, 3, 5, 2, 4, 6, 0];

            while (weekStart <= endDate) {
                for (let s = 0; s < sessionsPerWeek; s++) {
                    const dayOffset = dayPattern[s % dayPattern.length];
                    const blockDate = addDays(weekStart, dayOffset);

                    if (blockDate >= now && blockDate <= endDate) {
                        blocks.push({
                            taskId:      task.id,
                            date:        toISO(blockDate),
                            startHour,
                            durationHrs: sessionHrs,
                            label:       task.name,
                            color:       task.expand?.category_id?.color || '#3b82f6',
                            cat:         task.expand?.category_id?.name || 'Task',
                        });
                    }
                }
                weekStart = addDays(weekStart, 7);
            }
        } else {
            if (!task.due_date) return blocks;

            const due = new Date(task.due_date + 'T23:59:59');
            const daysLeft    = Math.max(1, Math.round((due - now) / 86400000));
            const weeksLeft   = Math.max(1, Math.ceil(daysLeft / 7));
            const totalHrs    = parseFloat(task.total_hours) || 10;
            const sessionHrs  = parseFloat(task.session_len) || 2;
            const totalSess   = Math.ceil(totalHrs / sessionHrs);
            const sessPerWeek = Math.ceil(totalSess / weeksLeft);

            const dayPattern = [1, 3, 5, 2, 4, 0, 6]; 
            let placed    = 0;
            let weekStart = getWeekStart(now);

            const priorityHourAdjust = task.priority === 'high' ? -1 : (task.priority === 'low' ? 1 : 0);
            const effectiveStart = Math.min(20, Math.max(7, startHour + priorityHourAdjust));

            while (placed < totalSess && weekStart <= due) {
                for (let s = 0; s < sessPerWeek && placed < totalSess; s++) {
                    const dayOffset = dayPattern[s % dayPattern.length];
                    const blockDate = addDays(weekStart, dayOffset);

                    if (blockDate >= now && blockDate <= due) {
                        const hourOffset = s >= dayPattern.length ? 4 : 0;
                        blocks.push({
                            taskId:      task.id,
                            date:        toISO(blockDate),
                            startHour:   Math.min(20, effectiveStart + hourOffset),
                            durationHrs: sessionHrs,
                            label:       task.name,
                            color:       task.expand?.category_id?.color || '#3b82f6',
                            cat:         task.expand?.category_id?.name || 'Task',
                        });
                        placed++;
                    }
                }
                weekStart = addDays(weekStart, 7);
            }
        }

        return blocks;
    }


    Alpine.data('timetableApp', () => ({

        viewMode:    'month',
        activePanel: null,
        searchQuery: '',
        currentDate: new Date(),
        grid:        [],
        days:   ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        months: ['January','February','March','April','May','June','July','August','September','October','November','December'],

        categories:       [],
        selectedCategoryId: '',
        newCatName:       '',
        newCatColor:      '#3b82f6',

        events:      [],
        newName:     '',
        newDate:     new Date().toISOString().split('T')[0],
        newTime:     '09:00',
        newEndTime:  '10:00',
        newColor:    '#3b82f6',
        colorMode:   'cat',

        isRecurring:     false,
        recurrenceRule:  'weekly',
        recurrenceEnd:   '',

        showDeleteModal:    false,
        deletingEvent:      null,
        deletingDate:       null,
        showEditChoiceModal: false,
        editingEvent:       null,
        editingDate:        null,
        isEditMode:         false,

        tasks:          [],
        taskWeekOffset: 0,
        taskWeekCols:   [],
        taskHours:      [7,8,9,10,11,12,13,14,15,16,17,18,19,20,21],
        taskFilter:     'all',
        allocPreview:   '',

        newTask: {
            name:               '',
            categoryId:         '',
            priority:           'medium',
            status:             'not_started',
            notes:              '',
            isRecurring:        false,
            dueDate:            '',
            linkedEventId:      '',
            totalHours:         null,
            sessionLen:         2,
            weeklyHours:        null,
            recSessionLen:      3,
            recurrenceEnd:      '',
            preferredStartTime: '09:00',
        },

        _taskBlocks: [],

        async init() {
            await this.refreshCategories();
            await this.refreshEvents();
            await this.refreshTasks();
            this.render();
            this.renderTaskWeek();

            this.$watch('viewMode',    () => this.render());
            this.$watch('currentDate', () => this.render());

            this.$watch('selectedCategoryId', (id) => {
                if (this.colorMode === 'cat') {
                    const cat = this.categories.find(c => c.id === id);
                    if (cat) this.newColor = cat.color;
                }
            });

            this.$watch('newTask.dueDate',    () => this.updateAllocPreview());
            this.$watch('newTask.totalHours', () => this.updateAllocPreview());
            this.$watch('newTask.sessionLen', () => this.updateAllocPreview());
        },

        async refreshCategories() {
            try {
                this.categories = await pb.collection('categories').getFullList({ sort: 'name' });
                if (this.categories.length > 0 && !this.selectedCategoryId) {
                    this.selectedCategoryId = this.categories[0].id;
                }
            } catch (err) { console.error('Category fetch failed', err); }
        },

        async addCategory() {
            if (!this.newCatName) return;
            try {
                await pb.collection('categories').create({ name: this.newCatName, color: this.newCatColor });
                this.newCatName = '';
                await this.refreshCategories();
            } catch (err) { console.error('Add category failed', err); }
        },

        async deleteCategory(id) {
            if (!confirm('Delete category? This will affect related tasks.')) return;
            try {
                await pb.collection('categories').delete(id);
                await this.refreshCategories();
            } catch (err) { console.error('Delete category failed', err); }
        },

        getCategoryColor(categoryId) {
            const cat = this.categories.find(c => c.id === categoryId);
            return cat?.color || '#3b82f6';
        },

        next()  { this.adjustDate(1); },
        prev()  { this.adjustDate(-1); },
        today() { this.currentDate = new Date(); this.render(); },

        adjustDate(offset) {
            const d = new Date(this.currentDate);
            if      (this.viewMode === 'year')  d.setFullYear(d.getFullYear() + offset);
            else if (this.viewMode === 'month') d.setMonth(d.getMonth() + offset);
            else if (this.viewMode === 'week')  d.setDate(d.getDate() + offset * 7);
            else if (this.viewMode === 'day')   d.setDate(d.getDate() + offset);
            this.currentDate = d;
        },

        render() {
            if      (this.viewMode === 'month') this.grid = this.generateMonthGrid(this.currentDate);
            else if (this.viewMode === 'week')  this.grid = this.generateWeekGrid(this.currentDate);
        },

        generateMonthGrid(date) {
            const year     = date.getFullYear();
            const month    = date.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const todayStr = new Date().toDateString();
            const cells    = [];
            for (let i = 0; i < firstDay; i++) cells.push({ day: '', fullDate: null, current: false });
            for (let i = 1; i <= daysInMonth; i++) {
                const cellDate = new Date(year, month, i);
                cells.push({ day: i, fullDate: cellDate, current: cellDate.toDateString() === todayStr });
            }
            return cells;
        },

        generateWeekGrid(date) {
            const startOfWeek = new Date(date);
            startOfWeek.setDate(date.getDate() - date.getDay());
            return Array.from({ length: 7 }, (_, i) => {
                const d = addDays(startOfWeek, i);
                return { day: d.getDate(), fullDate: d, current: d.toDateString() === new Date().toDateString() };
            });
        },

        generateMonthDays(year, month) {
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const todayStr    = new Date().toDateString();
            return Array.from({ length: daysInMonth }, (_, i) => {
                const d = new Date(year, month, i + 1);
                return { num: i + 1, date: d, current: d.toDateString() === todayStr, id: `mini-${year}-${month}-${i + 1}` };
            });
        },

        getHeaderText() {
            const year  = this.currentDate.getFullYear();
            const month = this.months[this.currentDate.getMonth()];
            if (this.viewMode === 'year')  return { main: year, sub: 'Annual Overview' };
            if (this.viewMode === 'day')   return { main: this.currentDate.getDate(), sub: `${month} ${year}` };
            if (this.viewMode === 'week') {
                const start = new Date(this.currentDate);
                start.setDate(this.currentDate.getDate() - this.currentDate.getDay());
                return { main: 'Week', details: `starting ${start.getDate()}`, sub: `${this.months[start.getMonth()]} ${year}` };
            }
            return { main: month, sub: year };
        },

        async refreshEvents() {
            try {
                this.events = await pb.collection('events').getFullList({ sort: 'date,start_time' });
            } catch (err) { console.error('Fetch failed', err); }
        },

        getEventsForDay(dateInput) {
            if (!dateInput) return [];
            const compareDate = new Date(dateInput);
            compareDate.setHours(0, 0, 0, 0);
            const dateISO = toISO(compareDate);

            return this.events.filter(event => {
                if (event.exceptions?.includes(dateISO)) return false;

                const start = new Date(event.date);
                start.setHours(0, 0, 0, 0);
                const endRange = event.recurrence_end ? new Date(event.recurrence_end) : null;
                if (endRange) endRange.setHours(0, 0, 0, 0);

                let dateMatch = false;
                if (this.isSameDay(start, compareDate)) {
                    dateMatch = true;
                } else if (event.is_recurring) {
                    if (compareDate >= start && (!endRange || compareDate <= endRange)) {
                        if (event.recurrence_rule === 'daily')   dateMatch = true;
                        if (event.recurrence_rule === 'weekly')  dateMatch = start.getDay() === compareDate.getDay();
                        if (event.recurrence_rule === 'monthly') dateMatch = start.getDate() === compareDate.getDate();
                    }
                }

                if (!dateMatch) return false;

                if (this.searchQuery.trim()) {
                    const q = this.searchQuery.toLowerCase();
                    return event.name.toLowerCase().includes(q) || (event.category || '').toLowerCase().includes(q);
                }
                return true;
            }).sort((a, b) => a.start_time.localeCompare(b.start_time));
        },

        async addEvent() {
            if (!this.newName) return;
            let finalColor = this.newColor;
            let finalCat   = 'Custom';

            if (this.colorMode === 'cat') {
                if (!this.selectedCategoryId) return;
                const cat = this.categories.find(c => c.id === this.selectedCategoryId);
                finalColor = cat.color;
                finalCat   = cat.name;
            }

            const eventDate = new Date(this.newDate + 'T00:00:00');

            const data = {
                name:            this.newName,
                category:        finalCat,
                color:           finalColor,
                date:            eventDate.toISOString(),
                start_time:      this.newTime,
                end_time:        this.newEndTime,
                is_recurring:    this.isRecurring,
                recurrence_rule: this.isRecurring ? this.recurrenceRule : 'weekly',
                recurrence_end:  (this.isRecurring && this.recurrenceEnd)
                                    ? new Date(this.recurrenceEnd + 'T23:59:59').toISOString()
                                    : null,
            };

            try {
                await pb.collection('events').create(data);
                this.newName     = '';
                this.isRecurring = false;
                this.recurrenceEnd = '';
                await this.refreshEvents();
                this.render();
            } catch (err) { console.error('Error saving event:', err); }
        },

        triggerDelete(event, instanceDate) {
            if (!event.is_recurring) {
                if (confirm(`Delete "${event.name}"?`)) this.confirmDelete('all', event, instanceDate);
                return;
            }
            this.deletingEvent = event;
            this.deletingDate  = instanceDate;
            this.showDeleteModal = true;
        },

        async confirmDelete(mode, event = null, date = null) {
            const targetEvent = event || this.deletingEvent;
            const targetDate  = date  || this.deletingDate;

            if (mode === 'single') {
                const dateStr = toISO(new Date(targetDate));
                const updatedExceptions = targetEvent.exceptions
                    ? [...targetEvent.exceptions, dateStr]
                    : [dateStr];
                try {
                    await pb.collection('events').update(targetEvent.id, { exceptions: updatedExceptions });
                    await this.refreshEvents();
                } catch (err) { console.error(err); }
            } else {
                try {
                    await pb.collection('events').delete(targetEvent.id);
                    this.events = this.events.filter(e => e.id !== targetEvent.id);
                } catch (err) { console.error(err); }
            }

            this.showDeleteModal = false;
            this.deletingEvent   = null;
            this.deletingDate    = null;
            this.render();
        },

        triggerEdit(event, instanceDate) {
            this.editingEvent = event;
            this.editingDate  = instanceDate;
            if (!event.is_recurring) { this.openEditForm(event); return; }
            this.showEditChoiceModal = true;
        },

        async saveEdit() {
            if (!this.newName || !this.editingEvent) return;
            const eventDate = new Date(this.newDate + 'T00:00:00');
            const data = {
                name:            this.newName,
                date:            eventDate.toISOString(),
                start_time:      this.newTime,
                end_time:        this.newEndTime,
                is_recurring:    this.isRecurring,
                recurrence_rule: this.isRecurring ? this.recurrenceRule : 'weekly',
                recurrence_end:  (this.isRecurring && this.recurrenceEnd)
                                    ? new Date(this.recurrenceEnd + 'T23:59:59').toISOString()
                                    : null,
            };
            try {
                if (this.editingEvent?.id) {
                    await pb.collection('events').update(this.editingEvent.id, data);
                } else {
                    await pb.collection('events').create(data);
                }
                this.isEditMode = false;
                await this.refreshEvents();
                this.render();
            } catch (err) { console.error(err); }
        },

        async selectEditMode(mode) {
            this.showEditChoiceModal = false;
            if (mode === 'single') {
                const dateStr = this.editingDate.toLocaleDateString('en-CA');
                const updatedExceptions = this.editingEvent.exceptions
                    ? [...this.editingEvent.exceptions, dateStr]
                    : [dateStr];
                try {
                    await pb.collection('events').update(this.editingEvent.id, { exceptions: updatedExceptions });
                    this.openEditForm(this.editingEvent);
                    this.newDate     = dateStr;
                    this.isRecurring = false;
                    this.editingEvent = null;
                } catch (err) { console.error(err); }
            } else {
                this.openEditForm(this.editingEvent);
            }
        },

        openEditForm(event) {
            this.isEditMode  = true;
            this.newName     = event.name;
            this.newDate     = toISO(new Date(event.date));
            this.newTime     = event.start_time;
            this.newEndTime  = event.end_time;
            this.newColor    = event.color;
            this.isRecurring = event.is_recurring;
            this.recurrenceRule = event.recurrence_rule;
            this.recurrenceEnd  = event.recurrence_end ? toISO(new Date(event.recurrence_end)) : '';
            document.querySelector('section')?.scrollIntoView({ behavior: 'smooth' });
        },

        async refreshTasks() {
            try {
                this.tasks = await pb.collection('tasks').getFullList({
                    sort:   'created',
                    expand: 'category_id',
                });
                this._rebuildBlocks();
            } catch (err) { console.error('Task fetch failed', err); }
        },

        _rebuildBlocks() {
            this._taskBlocks = this.tasks
                .filter(t => t.status !== 'complete')
                .flatMap(t => allocateBlocks(t));
        },

        get filteredTasks() {
            if (this.taskFilter === 'active')   return this.tasks.filter(t => t.status !== 'complete');
            if (this.taskFilter === 'complete') return this.tasks.filter(t => t.status === 'complete');
            return this.tasks;
        },

        async addTask() {
            const t = this.newTask;
            if (!t.name) return;

            const data = {
                name:                 t.name,
                category_id:          t.categoryId || null,
                priority:             t.priority,
                status:               'not_started',
                notes:                t.notes,
                is_recurring:         t.isRecurring,
                due_date:             !t.isRecurring ? (t.dueDate || null) : null,
                linked_event_id:      !t.isRecurring ? (t.linkedEventId || null) : null,
                total_hours:          !t.isRecurring ? (t.totalHours || null) : null,
                session_len:          !t.isRecurring ? (t.sessionLen || 2) : null,
                weekly_hours:         t.isRecurring  ? (t.weeklyHours || null) : null,
                rec_session_len:      t.isRecurring  ? (t.recSessionLen || 3) : null,
                recurrence_end:       t.isRecurring  ? (t.recurrenceEnd || null) : null,
                preferred_start_time: t.preferredStartTime || '09:00',
            };

            try {
                await pb.collection('tasks').create(data);
                this.newTask = {
                    name: '', categoryId: '', priority: 'medium', status: 'not_started',
                    notes: '', isRecurring: false, dueDate: '', linkedEventId: '',
                    totalHours: null, sessionLen: 2, weeklyHours: null, recSessionLen: 3,
                    recurrenceEnd: '', preferredStartTime: '09:00',
                };
                this.allocPreview = '';
                await this.refreshTasks();
                this.renderTaskWeek();
            } catch (err) { console.error('Task save failed:', err); }
        },

        async updateTaskStatus(taskId, newStatus) {
            try {
                await pb.collection('tasks').update(taskId, { status: newStatus });
                const t = this.tasks.find(t => t.id === taskId);
                if (t) t.status = newStatus;
                this._rebuildBlocks();
                this.renderTaskWeek();
            } catch (err) { console.error('Status update failed:', err); }
        },

        async deleteTask(taskId) {
            if (!confirm('Delete this task and all its allocated sessions?')) return;
            try {
                await pb.collection('tasks').delete(taskId);
                this.tasks = this.tasks.filter(t => t.id !== taskId);
                this._rebuildBlocks();
                this.renderTaskWeek();
            } catch (err) { console.error('Task delete failed:', err); }
        },

        renderTaskWeek() {
            const ws  = getWeekStart(new Date(), this.taskWeekOffset);
            const today = toISO(new Date());
            this.taskWeekCols = Array.from({ length: 7 }, (_, i) => {
                const d = addDays(ws, i);
                return {
                    dayName:  this.days[d.getDay()],
                    dayNum:   d.getDate(),
                    dateISO:  toISO(d),
                    isToday:  toISO(d) === today,
                };
            });
        },

        getTaskWeekLabel() {
            const ws = getWeekStart(new Date(), this.taskWeekOffset);
            const we = addDays(ws, 6);
            const fmt = d => `${d.getDate()} ${this.months[d.getMonth()].slice(0, 3)}`;
            return `${fmt(ws)} – ${fmt(we)} ${we.getFullYear()}`;
        },

        getTaskBlocksForSlot(dateISO, hour) {
            return this._taskBlocks.filter(b => b.date === dateISO && b.startHour === hour);
        },

        getWeekTaskHours() {
            if (!this.taskWeekCols.length) return 0;
            const dates = new Set(this.taskWeekCols.map(c => c.dateISO));
            const total = this._taskBlocks
                .filter(b => dates.has(b.date))
                .reduce((sum, b) => sum + (b.durationHrs || 0), 0);
            return Math.round(total * 10) / 10;
        },

        formatHour(h) {
            if (h === 12) return '12pm';
            return h > 12 ? `${h - 12}pm` : `${h}am`;
        },

        updateAllocPreview() {
            const due     = this.newTask.dueDate;
            const hrs     = parseFloat(this.newTask.totalHours) || 0;
            const sess    = parseFloat(this.newTask.sessionLen) || 2;

            if (!due || !hrs) { this.allocPreview = ''; return; }

            const now  = new Date(); now.setHours(0,0,0,0);
            const dueD = new Date(due + 'T00:00:00');
            const days = Math.max(1, Math.round((dueD - now) / 86400000));
            const weeks      = Math.max(1, Math.ceil(days / 7));
            const totalSess  = Math.ceil(hrs / sess);
            const perWeek    = Math.ceil(totalSess / weeks);

            this.allocPreview = `${totalSess} sessions total · ~${perWeek} per week of ${sess}h each across ${weeks} week${weeks > 1 ? 's' : ''}`;
        },

        getStyle(hex) {
            const color = (hex && hex.startsWith('#')) ? hex : '#3b82f6';
            return `background-color: ${color}15; border-color: ${color}40; color: ${color};`;
        },

        isSameDay(d1, d2) {
            return d1.getFullYear() === d2.getFullYear()
                && d1.getMonth()    === d2.getMonth()
                && d1.getDate()     === d2.getDate();
        },

        togglePanel(panel) {
            this.activePanel = this.activePanel === panel ? null : panel;
            if (this.activePanel === 'tasks') {
                this.$nextTick(() => this.renderTaskWeek());
            }
        },
    }));
});
