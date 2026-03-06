const pb = new PocketBase(window.location.origin);

function timetableApp() {
    return {
        events: [],
        newName: '',
        newDay: 'Monday',
        newTime: '09:00',

        async init() {
            this.events = await pb.collection('events').getFullList({
                sort: 'day,start_time',
            });
        },

        async addEvent() {
            if (!this.newName.trim()) return;

            const data = {
                name: this.newName,
                day: this.newDay,
                start_time: this.newTime
            };

            try {
                const record = await pb.collection('events').create(data);
                await this.init();
                this.newName = ''; 
            } catch (err) {
                console.error(err);
            }
        },

        async deleteEvent(id) {
            if(!confirm("Are you sure you want to delete this event?")) return;

            try {
                await pb.collection("events").delete(id);
                this.events = this.events.filter(event => event.id !== id);
            } catch (err) {
                console.error("Deletion failed: ", err);
                alert("Failed to delete the iteam. Check your API rules.");
            }
        },

        formatDisplay(event) {
            return `${event.day} at ${event.start_time}`;
        },
    }
}