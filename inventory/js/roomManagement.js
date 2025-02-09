import { db, auth } from './firebase-config.js';
import { 
    collection, 
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    doc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/9.14.0/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.14.0/firebase-auth.js';

let user = null;
let floorModal = null;

// Initialize modals
let roomDetailsModal;

// Initialize variables
let currentRoomId = null;
let currentFloorId = null;

// Version constant for cache busting
const APP_VERSION = '1.0.0';

// Function to log activity
async function logActivity(action, data) {
    try {
        // Check if user is authenticated
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.warn('Cannot log activity: User not authenticated');
            return;
        }

        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.data();

        const activityLog = {
            userId: currentUser.uid,
            userName: userData?.username || currentUser.displayName || currentUser.email,
            email: currentUser.email,
            role: userData?.role || '',
            action: action,
            details: typeof data === 'string' ? data : data.details,
            type: data.type || 'general',
            references: data.references || {},
            timestamp: serverTimestamp(),
            deviceInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform
            }
        };

        await addDoc(collection(db, 'activityLogs'), activityLog);
        
        // Update real-time activity log if modal is open
        const modalElement = document.querySelector('#activityLogModal.show');
        if (modalElement) {
            await loadActivityLogs();
        }
    } catch (error) {
        console.error('Error logging activity:', error);
    }
}

// Function to format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp || !timestamp.toDate) {
        return 'Unknown time';
    }
    
    const date = timestamp.toDate();
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / 1000 / 60);
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    
    return date.toLocaleString('en-US', { 
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Function to load activity log
async function loadActivityLogs() {
    try {
        const activityLogContainer = document.getElementById('activityLogContainer');
        if (!activityLogContainer) {
            console.error('Activity log container not found');
            return;
        }

        // Show loading state
        activityLogContainer.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;

        // Wait for filters to be available in the DOM
        const typeFilter = document.getElementById('activityTypeFilter');
        const roleFilter = document.getElementById('userRoleFilter');
        const searchText = document.getElementById('searchActivity');

        if (!typeFilter || !roleFilter || !searchText) {
            console.error('Activity log filters not found');
            return;
        }

        const querySnapshot = await getDocs(collection(db, 'activityLogs'));
        if (querySnapshot.empty) {
            activityLogContainer.innerHTML = `
                <div class="text-center p-4">
                    <div class="text-muted">
                        <i class="fas fa-info-circle me-2"></i>
                        No activity logs found
                    </div>
                </div>
            `;
            return;
        }

        // Get filter values
        const typeFilterValue = typeFilter.value;
        const roleFilterValue = roleFilter.value;
        const searchTextValue = searchText.value.toLowerCase();

        const logs = [];
        for (const doc of querySnapshot.docs) {
            const log = doc.data();
            
            // Apply filters
            const matchesType = !typeFilterValue || typeFilterValue === 'all' || log.action?.toLowerCase() === typeFilterValue.toLowerCase();
            const matchesRole = !roleFilterValue || roleFilterValue === 'all' || log.role?.toLowerCase() === roleFilterValue.toLowerCase();
            const matchesSearch = !searchTextValue || 
                                log.details?.toLowerCase().includes(searchTextValue) || 
                                log.userName?.toLowerCase().includes(searchTextValue) ||
                                log.email?.toLowerCase().includes(searchTextValue);

            if (matchesType && matchesRole && matchesSearch) {
                logs.push({
                    id: doc.id,
                    ...log
                });
            }
        }

        // Sort logs by timestamp (newest first)
        logs.sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds);

        if (logs.length === 0) {
            activityLogContainer.innerHTML = `
                <div class="text-center p-4">
                    <div class="text-muted">
                        <i class="fas fa-filter me-2"></i>
                        No matching logs found
                    </div>
                </div>
            `;
            return;
        }

        const logsHTML = logs.map(log => {
            // Get role badge color
            const roleBadgeClass = getRoleBadgeClass(log.role);
            const actionBadgeClass = getActionClass(log.action);
            const timestamp = log.timestamp ? formatTimestamp(log.timestamp) : 'N/A';

            // Build additional details HTML
            let additionalDetails = '';
            if (log.roomData) {
                additionalDetails += `
                    <div class="mt-2">
                        <small class="text-muted">
                            <i class="fas fa-door-open me-1"></i>Room: ${log.roomData.name || log.references.roomId}
                        </small>
                    </div>
                `;
            }
            if (log.equipmentData) {
                additionalDetails += `
                    <div class="mt-1">
                        <small class="text-muted">
                            <i class="fas fa-tools me-1"></i>Equipment: ${log.equipmentData.name || 'Unknown'}
                        </small>
                    </div>
                `;
            }

            return `
                <div class="activity-log-item p-3 border-bottom">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <span class="badge ${actionBadgeClass} me-2">${log.action}</span>
                            <span class="badge ${roleBadgeClass}">${log.role || 'N/A'}</span>
                        </div>
                        <small class="text-muted">
                            <i class="far fa-clock me-1"></i>${timestamp}
                        </small>
                    </div>
                    <p class="mb-1">${log.details}</p>
                    <small class="text-muted">
                        <i class="far fa-user me-1"></i>
                        ${log.userName || log.email}
                    </small>
                    ${additionalDetails}
                </div>
            `;
        }).join('');

        activityLogContainer.innerHTML = logsHTML;

        // Add event listeners to filters
        const filters = ['activityTypeFilter', 'userRoleFilter', 'searchActivity'];
        filters.forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                // Remove existing listeners to prevent duplicates
                const newElement = element.cloneNode(true);
                element.parentNode.replaceChild(newElement, element);
                
                if (filterId === 'searchActivity') {
                    newElement.addEventListener('input', debounce(loadActivityLogs, 300));
                } else {
                    newElement.addEventListener('change', loadActivityLogs);
                }
            }
        });

    } catch (error) {
        console.error('Error loading activity logs:', error);
        const activityLogContainer = document.getElementById('activityLogContainer');
        if (activityLogContainer) {
            activityLogContainer.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Error loading activity logs
                </div>
            `;
        }
    }
}

// Debounce function to limit how often a function is called
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Function to get role badge class
function getRoleBadgeClass(role) {
    const roleMap = {
        'admin': 'bg-danger',
        'faculty': 'bg-success',
        'it office': 'bg-info',
        'property custodian': 'bg-warning'
    };
    
    return roleMap[role.toLowerCase()] || 'bg-secondary';
}

// Function to get action class for badge
function getActionClass(action) {
    const actionMap = {
        'create': 'bg-success',
        'update': 'bg-primary',
        'delete': 'bg-danger',
        'add': 'bg-info',
        'remove': 'bg-warning',
        'maintenance': 'bg-warning',
        'replacement': 'bg-danger'
    };
    
    const actionLower = action.toLowerCase();
    for (const [key, value] of Object.entries(actionMap)) {
        if (actionLower.includes(key)) {
            return value;
        }
    }
    return 'bg-secondary';
}

// Function to clear browser cache
function clearCache() {
    // Append version to all script and link elements
    document.querySelectorAll('script[src], link[rel="stylesheet"]').forEach(el => {
        const url = new URL(el.src || el.href);
        url.searchParams.set('v', APP_VERSION);
        el.src = url.toString();
    });
}

// Show room management modal
async function showRoomManagementModal() {
    const modalTemplate = document.getElementById('roomManagementModalTemplate');
    if (!modalTemplate) {
        console.error('Room management modal template not found');
        return;
    }

    // Remove existing modal if any
    const existingModal = document.querySelector('#roomManagementModal');
    if (existingModal) {
        const existingBootstrapModal = bootstrap.Modal.getInstance(existingModal);
        if (existingBootstrapModal) {
            existingBootstrapModal.dispose();
        }
        existingModal.remove();
    }

    // Clone the template
    const modalElement = modalTemplate.content.cloneNode(true).querySelector('.modal');
    document.body.appendChild(modalElement);

    // Initialize the modal
    const roomModal = new bootstrap.Modal(modalElement);

    // Update floor selects before showing the modal
    await updateFloorSelects();

    // Add event listener to remove modal from DOM when hidden
    modalElement.addEventListener('hidden.bs.modal', () => {
        modalElement.remove();
    });

    roomModal.show();
}

// Update floor selects in room management modal
async function updateFloorSelects() {
    try {
        const floorSelect = document.getElementById('floorSelect');
        const floorSelectRemove = document.getElementById('floorSelectRemove');
        const roomSelectRemove = document.getElementById('roomSelectRemove');
        
        if (!floorSelect || !floorSelectRemove || !roomSelectRemove) {
            console.error('Floor select elements not found');
            return;
        }
        
        // Get floors from Firestore
        const floorsSnapshot = await getDocs(query(collection(db, 'floors'), orderBy('number')));
        
        // Clear existing options
        floorSelect.innerHTML = '<option value="">Select a floor</option>';
        floorSelectRemove.innerHTML = '<option value="">Select a floor</option>';
        roomSelectRemove.innerHTML = '<option value="">Select a room</option>';
        
        // Add floor options
        floorsSnapshot.forEach(doc => {
            const floor = doc.data();
            const option = `<option value="${floor.number}">Floor ${floor.number}</option>`;
            floorSelect.insertAdjacentHTML('beforeend', option);
            floorSelectRemove.insertAdjacentHTML('beforeend', option);
        });
        
        // Disable room selection and remove button initially
        roomSelectRemove.disabled = true;
        const removeRoomBtn = document.getElementById('removeRoomBtn');
        if (removeRoomBtn) {
            removeRoomBtn.disabled = true;
        }
    } catch (error) {
        console.error('Error updating floor selects:', error);
        alert('Error loading floors. Please try again.');
    }
}

// Add room to a floor
async function addRoom(e) {
    e.preventDefault();
    const floor = document.getElementById('floorSelect').value;
    const roomNumber = document.getElementById('roomNumber').value;
    const roomName = document.getElementById('roomName').value;
    
    if (!floor) {
        showToast('Please select a floor', 'error');
        return;
    }

    try {
        // Check if room number already exists in this floor
        const existingRoomsQuery = query(collection(db, 'rooms'), where('floor', '==', floor), where('number', '==', roomNumber));
        const existingRoomsSnapshot = await getDocs(existingRoomsQuery);
            
        if (!existingRoomsSnapshot.empty) {
            showToast('A room with this number already exists on this floor!', 'error');
            return;
        }

        const roomId = `${floor}-${roomNumber}`;
        
        await setDoc(doc(db, 'rooms', roomId), {
            id: roomId,
            floor: floor,  // Store as string to maintain consistency
            number: roomNumber,
            name: roomName,
            equipment: [],
            maintenance: [],
            replacements: [],
            lastModified: serverTimestamp()
        });

        // Log the activity
        await logActivity('add_room', `Added room ${roomName} (${roomNumber}) on Floor ${floor}`);

        // Close the modal
        const modalElement = document.querySelector('#roomManagementModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) {
                modal.hide();
            }
        }

        // Clear the form
        document.getElementById('addRoomForm').reset();

        // Refresh the page content
        await loadSavedRooms();
        await updateFloorsList();
        await updateAllFloors();

        showToast('Room added successfully!', 'success');
    } catch (error) {
        console.error('Error adding room:', error);
        showToast('Error adding room. Please try again.', 'error');
    }
}

// Add event listener for the add room form
document.addEventListener('DOMContentLoaded', function() {
    document.body.addEventListener('submit', function(e) {
        if (e.target && e.target.id === 'addRoomForm') {
            addRoom(e);
        }
    });
});

// Update room selection when floor is changed for room removal
document.addEventListener('DOMContentLoaded', function() {
    document.body.addEventListener('change', async function(e) {
        if (e.target && e.target.id === 'floorSelectRemove') {
            const floor = e.target.value;
            const roomSelect = document.getElementById('roomSelectRemove');
            const removeRoomBtn = document.getElementById('removeRoomBtn');
            
            if (!roomSelect) return;
            
            // Reset room select
            roomSelect.innerHTML = '<option value="">Select a room</option>';
            roomSelect.disabled = !floor;
            if (removeRoomBtn) {
                removeRoomBtn.disabled = true;
            }
            
            if (floor) {
                try {
                    const roomsQuery = query(collection(db, 'rooms'), where('floor', '==', floor), orderBy('number'));
                    const roomsSnapshot = await getDocs(roomsQuery);
                    
                    roomsSnapshot.forEach(doc => {
                        const room = doc.data();
                        const option = document.createElement('option');
                        option.value = doc.id;
                        option.textContent = `Room ${room.number}${room.name ? ` - ${room.name}` : ''}`;
                        roomSelect.appendChild(option);
                    });
                } catch (error) {
                    console.error('Error loading rooms:', error);
                    showToast('Error loading rooms. Please try again.', 'error');
                }
            }
        }
    });

    // Handle room selection change
    document.body.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'roomSelectRemove') {
            const removeRoomBtn = document.getElementById('removeRoomBtn');
            if (removeRoomBtn) {
                removeRoomBtn.disabled = !e.target.value;
            }
        }
    });

    // Handle room removal
    document.body.addEventListener('submit', async function(e) {
        if (e.target && e.target.id === 'removeRoomForm') {
            e.preventDefault();
            const roomSelect = document.getElementById('roomSelectRemove');
            if (!roomSelect || !roomSelect.value) {
                showToast('Please select a room to remove', 'error');
                return;
            }

            showConfirmation(
                'Are you sure you want to remove this room?',
                async () => {
                    try {
                        await deleteRoom(roomSelect.value);
                        
                        // Trigger floor select change to refresh room list
                        const floorSelect = document.getElementById('floorSelectRemove');
                        if (floorSelect) {
                            floorSelect.dispatchEvent(new Event('change'));
                        }

                        // Close the room management modal
                        const roomManagementModal = bootstrap.Modal.getInstance(document.getElementById('roomManagementModal'));
                        if (roomManagementModal) {
                            roomManagementModal.hide();
                        }

                        // Refresh the page content
                        await loadSavedRooms();
                        await updateFloorsList();
                        await updateAllFloors();
                        await refreshPageContent();

                        showToast('Room removed successfully!', 'success');

                    } catch (error) {
                        console.error('Error removing room:', error);
                        showToast('Error removing room. Please try again.', 'error');
                    }
                },
                'Remove Room'
            );
        }
    });
});

// Delete room with confirmation
async function deleteRoom(roomId) {
    try {
        // Get room details first
        const roomDoc = await getDoc(doc(db, 'rooms', roomId));
        if (!roomDoc.exists()) {
            showToast('Room not found.', 'error');
            return;
        }
        const roomData = roomDoc.data();

        // Show loading toast
        showToast('Deleting room and associated data...', 'info');

        // Delete all equipment
        const equipmentSnapshot = await getDocs(collection(db, `rooms/${roomId}/equipment`));
        const equipmentDeletions = equipmentSnapshot.docs.map(doc => 
            deleteDoc(doc.ref)
        );

        // Delete all maintenance records
        const maintenanceSnapshot = await getDocs(collection(db, `rooms/${roomId}/maintenance`));
        const maintenanceDeletions = maintenanceSnapshot.docs.map(doc => 
            deleteDoc(doc.ref)
        );

        // Delete all replacement records
        const replacementSnapshot = await getDocs(collection(db, `rooms/${roomId}/replacements`));
        const replacementDeletions = replacementSnapshot.docs.map(doc => 
            deleteDoc(doc.ref)
        );

        // Wait for all deletions to complete
        await Promise.all([
            ...equipmentDeletions,
            ...maintenanceDeletions,
            ...replacementDeletions
        ]);

        // Finally delete the room
        await deleteDoc(doc(db, 'rooms', roomId));

        // Show success message
        showToast(`Room ${roomData.number} has been successfully deleted.`, 'success');


        // Update the display
        await backToDashboard();
        await updateDashboardStats();
        await loadSavedRooms();
        await updateFloorsList();
        await updateAllFloors();


        showToast(`Refresh The Page If adding new room`, 'warning');

        // Log activity
        await logActivity('delete', `Deleted room ${roomData.number} and all associated records`);

    } catch (error) {
        console.error('Error deleting room:', error);
        showToast('An error occurred while deleting the room.', 'error');
        throw error; // Re-throw to handle in the calling function
    }
}

// Save room to Firestore
async function saveRoom(roomId, roomData) {
    try {
        const roomRef = doc(db, 'rooms', roomId);
        await updateDoc(roomRef, roomData);
        
        // Log the activity
        await logActivity('update', `Updated details for room ${roomData.number}`);
        
        // Update dashboard stats
        updateDashboardStats();
    } catch (error) {
        console.error('Error saving room:', error);
        throw error;
    }
}

// Function to show toast messages
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '1050';
        document.body.appendChild(container);
    }

    const toastElement = document.createElement('div');
    toastElement.className = 'toast';
    toastElement.setAttribute('role', 'alert');
    toastElement.setAttribute('aria-live', 'assertive');
    toastElement.setAttribute('aria-atomic', 'true');

    let bgColor, icon;
    switch(type) {
        case 'success':
            bgColor = 'bg-success text-white';
            icon = 'fas fa-check-circle';
            break;
        case 'error':
            bgColor = 'bg-danger text-white';
            icon = 'fas fa-exclamation-circle';
            break;
        case 'warning':
            bgColor = 'bg-warning';
            icon = 'fas fa-exclamation-triangle';
            break;
        default:
            bgColor = 'bg-info text-white';
            icon = 'fas fa-info-circle';
    }

    toastElement.innerHTML = `
        <div class="toast-header ${bgColor}">
            <i class="${icon} me-2"></i>
            <strong class="me-auto">Notification</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
            ${message}
        </div>
    `;

    document.getElementById('toastContainer').appendChild(toastElement);
    const toast = new bootstrap.Toast(toastElement, {
        autohide: true,
        delay: 5000
    });
    toast.show();

    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

// Function to show confirmation dialog
function showConfirmation(message, onConfirm, title = 'Confirmation Required') {
    const modalId = 'confirmationModal';
    let modalElement = document.getElementById(modalId);

    // Clean up any existing modal first
    if (modalElement) {
        document.body.removeChild(modalElement);
    }

    // Create new modal
    modalElement = document.createElement('div');
    modalElement.id = modalId;
    modalElement.className = 'modal fade';
    modalElement.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">${title}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="${modalId}-confirmBtn">Confirm</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalElement);

    // Initialize Bootstrap modal
    const modal = new bootstrap.Modal(modalElement);
    
    // Get confirm button using the unique ID
    const confirmBtn = modalElement.querySelector(`#${modalId}-confirmBtn`);
    
    if (!confirmBtn) {
        console.error('Confirm button not found');
        return;
    }

    const handleConfirm = () => {
        modal.hide();
        onConfirm();
        confirmBtn.removeEventListener('click', handleConfirm);
    };

    // Clean up event listeners when modal is hidden
    modalElement.addEventListener('hidden.bs.modal', () => {
        confirmBtn.removeEventListener('click', handleConfirm);
    });

    confirmBtn.addEventListener('click', handleConfirm);
    modal.show();
}

// Get room details from Firestore
async function getRoomDetails(roomId) {
    try {
        const roomRef = doc(db, 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);
        if (roomDoc.exists()) {
            return {
                id: roomDoc.id,
                ...roomDoc.data()
            };
        }
        throw new Error('Room not found');
    } catch (error) {
        console.error('Error getting room details:', error);
        throw error;
    }
}

// Show room details
async function showRoomDetails(roomId) {
    try {
        currentRoomId = roomId;
        const roomData = await getRoomDetails(roomId);
        
        if (!roomData) {
            showToast('Error', 'Room not found');
            return;
        }

        // Hide dashboard
        document.getElementById('defaultDashboard').classList.add('d-none');
        document.getElementById('activityLogSection')?.classList.add('d-none');

        // Create or get room details section
        let roomDetailsSection = document.getElementById('roomDetailsSection');
        if (!roomDetailsSection) {
            roomDetailsSection = document.createElement('div');
            roomDetailsSection.id = 'roomDetailsSection';
            document.getElementById('mainContentArea').appendChild(roomDetailsSection);
        }
        roomDetailsSection.classList.remove('d-none');

        // Update room details content using template literal
        const roomDetailsTemplate = `
            <div class="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 class="mb-0">Room ${roomData.number}</h2>
                    <div class="d-flex align-items-center">
                        <p class="text-muted mb-0 me-2">${roomData.name || 'No name'}</p>
                    </div>
                </div>
                <div class="btn-group">
                    <button type="button" class="btn btn-outline-danger" onclick="confirmDeleteRoom('${roomId}')">
                        <i class="fas fa-trash me-2"></i>Delete Room
                    </button>
                    <button type="button" class="btn btn-outline-secondary" onclick="backToDashboard()">
                        <i class="fas fa-arrow-left me-2"></i>Back
                    </button>
                </div>
            </div>

            <div class="row">
                <div class="col-md-4">
                    <div class="card shadow-sm mb-4">
                        <div class="card-header bg-transparent">
                            <h5 class="card-title mb-0">Room Details</h5>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label">Room Number</label>
                                <input type="text" class="form-control" id="roomNumber" value="${roomData.number}" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Room Name</label>
                                <input type="text" class="form-control" id="roomName" value="${roomData.name || ''}" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Floor</label>
                                <input type="text" class="form-control" id="roomFloor" value="${roomData.floor}" readonly>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-md-8">
                    <!-- Equipment Section -->
                    <div class="card shadow-sm mb-4">
                        <div class="card-header bg-transparent d-flex justify-content-between align-items-center">
                            <h5 class="card-title mb-0">Equipment</h5>
                            <button type="button" class="btn btn-primary btn-sm" onclick="showAddEquipmentModal('${roomId}')">
                                <i class="fas fa-plus me-2"></i>Add Equipment
                            </button>
                        </div>
                        <div class="card-body">
                            <div id="equipmentList" class="list-group list-group-flush">
                                <div class="text-center text-muted py-3">Loading equipment...</div>
                            </div>
                        </div>
                    </div>

                    <!-- Needs Maintenance Section -->
                    <div class="card shadow-sm mb-4">
                        <div class="card-header bg-transparent d-flex justify-content-between align-items-center">
                            <h5 class="card-title mb-0">Needs Maintenance</h5>
                            <button type="button" class="btn btn-warning btn-sm" onclick="addNeedsMaintenance('${roomId}')">
                                <i class="fas fa-wrench me-2"></i>Report Equipment
                            </button>
                        </div>
                        <div class="card-body">
                            <div id="maintenanceList" class="list-group list-group-flush">
                                <div class="text-center text-muted py-3">Loading maintenance needs...</div>
                            </div>
                        </div>
                    </div>

                    <!-- Needs Replacement Section -->
                    <div class="card shadow-sm">
                        <div class="card-header bg-transparent d-flex justify-content-between align-items-center">
                            <h5 class="card-title mb-0">Needs Replacement</h5>
                            <button type="button" class="btn btn-danger btn-sm" onclick="addNeedsReplacement('${roomId}')">
                                <i class="fas fa-exclamation-triangle me-2"></i>Report Equipment
                            </button>
                        </div>
                        <div class="card-body">
                            <div id="replacementList" class="list-group list-group-flush">
                                <div class="text-center text-muted py-3">Loading replacement needs...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        roomDetailsSection.innerHTML = eval('`' + roomDetailsTemplate + '`');

        // Load related data
        loadEquipmentForRoom(roomId);
        loadMaintenanceForRoom(roomId);
        loadReplacementsForRoom(roomId);

    } catch (error) {
        console.error('Error showing room details:', error);
        showToast('Error', 'Failed to load room details');
    }
}

// Show add equipment modal
async function showAddEquipmentModal(roomId) {
    try {
        const modalHtml = `
            <div class="modal fade" id="addEquipmentModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Add Equipment</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="addEquipmentForm" onsubmit="event.preventDefault(); addEquipment('${roomId}');">
                                <div class="mb-3">
                                    <label class="form-label">Equipment Name</label>
                                    <input type="text" class="form-control" id="equipmentName" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Quantity</label>
                                    <input type="number" class="form-control" id="equipmentQuantity" min="1" value="1" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Condition</label>
                                    <select class="form-select" id="equipmentCondition" required>
                                        <option value="Good">Good</option>
                                        <option value="Fair">Fair</option>
                                        <option value="Poor">Poor</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Status</label>
                                    <select class="form-select" id="equipmentStatus" required>
                                        <option value="Available">Available</option>
                                        <option value="In Use">In Use</option>
                                        <option value="Under Maintenance">Under Maintenance</option>
                                        <option value="Out of Service">Out of Service</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Notes</label>
                                    <textarea class="form-control" id="equipmentNotes" rows="3"></textarea>
                                </div>
                                <div class="modal-footer px-0 pb-0">
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                    <button type="submit" class="btn btn-primary">Add Equipment</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('addEquipmentModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Initialize modal
        const modal = new bootstrap.Modal(document.getElementById('addEquipmentModal'));
        modal.show();
    } catch (error) {
        console.error('Error showing add equipment modal:', error);
        showToast('Error showing add equipment modal', 'error');
    }
}

// Add equipment to a room
async function addEquipment(roomId) {
    try {
        // Get the room document first
        const roomRef = doc(db, 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);
        
        if (!roomDoc.exists()) {
            console.error('Room not found:', roomId);
            showToast('Error: Room not found', 'error');
            return;
        }

        const equipmentData = {
            name: document.getElementById('equipmentName').value,
            quantity: parseInt(document.getElementById('equipmentQuantity').value),
            condition: document.getElementById('equipmentCondition').value,
            status: document.getElementById('equipmentStatus').value,
            notes: document.getElementById('equipmentNotes').value,
            addedAt: serverTimestamp(),
            roomId: roomId,
            floor: roomDoc.data().floor // Store the floor number as well
        };

        // Add equipment to the specific room's equipment collection
        await addDoc(collection(db, `rooms/${roomId}/equipment`), equipmentData);
        
        // Log activity
        await logActivity('add', `Added equipment ${equipmentData.name} to room ${roomId}`);
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addEquipmentModal'));
        modal.hide();
        
        // Refresh equipment list for this specific room
        loadEquipmentForRoom(roomId);
        
        // Update dashboard stats
        updateDashboardStats();
        
        showToast('Equipment added successfully!', 'success');
    } catch (error) {
        console.error('Error adding equipment:', error);
        showToast('Error adding equipment: ' + error.message, 'error');
    }
}

// Add maintenance record
async function addMaintenanceRecord(roomId) {
    try {
        const modalHtml = `
            <div class="modal fade" id="addMaintenanceModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Add Maintenance Record</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="addMaintenanceForm">
                                <div class="mb-3">
                                    <label class="form-label">Date</label>
                                    <input type="date" class="form-control" id="maintenanceDate" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea class="form-control" id="maintenanceDescription" rows="3" required></textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Status</label>
                                    <select class="form-select" id="maintenanceStatus" required>
                                        <option value="Pending">Pending</option>
                                        <option value="In Progress">In Progress</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="submitMaintenanceRecord('${roomId}')">Add Record</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to body if it doesn't exist
        if (!document.getElementById('addMaintenanceModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        // Set today's date as default
        document.getElementById('maintenanceDate').valueAsDate = new Date();

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('addMaintenanceModal'));
        modal.show();
    } catch (error) {
        console.error('Error showing maintenance modal:', error);
        showToast('Error', 'Failed to show maintenance modal');
    }
}

// Submit maintenance record
async function submitMaintenanceRecord(roomId) {
    try {
        const maintenanceData = {
            date: document.getElementById('maintenanceDate').value,
            description: document.getElementById('maintenanceDescription').value,
            status: document.getElementById('maintenanceStatus').value,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, `rooms/${roomId}/maintenance`), maintenanceData);
        
        // Log activity
        await logActivity('add', `Added maintenance record for room ${roomId}`);
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addMaintenanceModal'));
        modal.hide();
        
        // Refresh maintenance list
        loadMaintenanceForRoom(roomId);
        
        // Update dashboard stats
        updateDashboardStats();
        
        showToast('Maintenance record added successfully!', 'success');
    } catch (error) {
        console.error('Error adding maintenance record:', error);
        showToast('Error', 'Failed to add maintenance record');
    }
}

// Add replacement record
async function addReplacementRecord(roomId) {
    try {
        const modalHtml = `
            <div class="modal fade" id="addReplacementModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Add Replacement Record</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="addReplacementForm">
                                <div class="mb-3">
                                    <label class="form-label">Date</label>
                                    <input type="date" class="form-control" id="replacementDate" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea class="form-control" id="replacementDescription" rows="3" required></textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Status</label>
                                    <select class="form-select" id="replacementStatus" required>
                                        <option value="Pending">Pending</option>
                                        <option value="Approved">Approved</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Rejected">Rejected</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="submitReplacementRecord('${roomId}')">Add Record</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to body if it doesn't exist
        if (!document.getElementById('addReplacementModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        // Set today's date as default
        document.getElementById('replacementDate').valueAsDate = new Date();

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('addReplacementModal'));
        modal.show();
    } catch (error) {
        console.error('Error showing replacement modal:', error);
        showToast('Error', 'Failed to show replacement modal');
    }
}

// Submit replacement record
async function submitNeedsReplacement(roomId) {
    try {
        // First get the current room data
        const roomRef = doc(db, 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);
        
        if (!roomDoc.exists()) {
            throw new Error('Room not found');
        }

        const replacementData = {
            equipmentName: document.getElementById('replacementEquipmentName').value,
            quantity: document.getElementById('replacementQuantity').value,
            status: document.getElementById('replacementStatus').value,
            description: document.getElementById('replacementDescription').value,
            createdAt: Timestamp.now(),
            resolved: false,
            equipmentId: document.getElementById('replacementEquipmentName').dataset.equipmentId || null
        };

        // Get current replacements array or initialize it
        const currentData = roomDoc.data();
        const replacements = currentData.replacements || [];
        
        // Add new replacement data to the array
        replacements.push(replacementData);
        
        // Update the room document with the new replacements array
        await updateDoc(roomRef, {
            replacements: replacements
        });
        
        // Log the activity
        await logActivity('Added Replacement Need', {
            type: 'replacement',
            details: `Added replacement need for ${replacementData.equipmentName} in room ${roomId}`,
            references: {
                roomId: roomId,
                equipmentName: replacementData.equipmentName,
                quantity: replacementData.quantity,
                status: replacementData.status,
                reason: replacementData.description
            }
        });
        
        // Close modal and clear form
        const modal = bootstrap.Modal.getInstance(document.getElementById('needsReplacementModal'));
        modal.hide();
        document.getElementById('needsReplacementForm').reset();
        
        // Refresh replacement list
        await loadReplacementsForRoom(roomId);
        
        // Update dashboard stats
        updateDashboardStats();
        
        showToast('Success', 'Replacement need recorded successfully');
    } catch (error) {
        console.error('Error adding replacement need:', error);
        showToast('Error', 'Failed to record replacement need');
    }
} 

// Show floor management modal
function showFloorManagementModal() {
    if (!floorModal) {
        floorModal = new bootstrap.Modal(document.getElementById('floorManagementModal'));
    }

    // Add event listeners for focus management
    const modalElement = document.getElementById('floorManagementModal');
    
    // Remove any existing event listeners to prevent multiple attachments
    modalElement.removeEventListener('hidden.bs.modal', handleModalHidden);
    
    // Define the event handler for modal hidden state
    function handleModalHidden() {
        // Restore focus to the manage floors button
        const manageFloorsBtn = document.getElementById('manageFloorsBtn');
        if (manageFloorsBtn) {
            manageFloorsBtn.focus();
        }

        // Remove any disabled state from the UI
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
    }

    // Add the event listener
    modalElement.addEventListener('hidden.bs.modal', handleModalHidden);

    updateFloorsList();
    floorModal.show();
}

// Update floors list in modal and sidebar
async function updateFloorsList() {
    try {
        const floorsList = document.getElementById('floorsList');
        const floorAccordion = document.getElementById('floorAccordion');
        
        if (!floorsList || !floorAccordion) {
            console.error('Floor lists elements not found');
            return;
        }

        // Get floors from Firestore
        const floorsQuery = query(collection(db, 'floors'), orderBy('number'));
        const floorsSnapshot = await getDocs(floorsQuery);
        
        // Clear existing floors
        floorsList.innerHTML = '';
        floorAccordion.innerHTML = '';
        
        floorsSnapshot.forEach(doc => {
            const floor = doc.data();
            
            // Add to floors list in modal
            const listItem = document.createElement('div');
            listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
            listItem.innerHTML = `
                <span>Floor ${floor.number}${floor.name ? ` - ${floor.name}` : ''}</span>
                <button class="btn btn-sm btn-danger" onclick="removeFloor('${doc.id}', ${floor.number})">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            floorsList.appendChild(listItem);
            
            // Add to sidebar accordion
            const floorDiv = document.createElement('div');
            floorDiv.className = 'accordion-item border-0 mb-2';
            floorDiv.innerHTML = `
                <h2 class="accordion-header shadow-sm rounded">
                    <button class="accordion-button collapsed rounded" type="button" data-bs-toggle="collapse" data-bs-target="#floor${floor.number}">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-building me-2"></i>
                            <span>Floor ${floor.number}${floor.name ? ` - ${floor.name}` : ''}</span>
                        </div>
                    </button>
                </h2>
                <div id="floor${floor.number}" class="accordion-collapse collapse" data-bs-parent="#floorAccordion">
                    <div class="accordion-body p-2">
                        <div class="list-group list-group-flush rounded-3" id="floor${floor.number}Rooms">
                            <!-- Rooms will be dynamically added here -->
                        </div>
                    </div>
                </div>
            `;
            floorAccordion.appendChild(floorDiv);
            
            // Load rooms for this floor
            loadRoomsForFloor(floor.number);
        });
    } catch (error) {
        console.error('Error updating floors list:', error);
    }
}

// Load rooms for a specific floor
async function loadRoomsForFloor(floorNumber) {
    try {
        const roomsQuery = query(collection(db, 'rooms'), where('floor', '==', floorNumber.toString()), orderBy('number'));
        const roomsSnapshot = await getDocs(roomsQuery);
        
        const roomsList = document.querySelector(`#floor${floorNumber}Rooms`);
        if (!roomsList) {
            console.error(`Rooms list element for floor ${floorNumber} not found`);
            return;
        }
        
        if (roomsSnapshot.empty) {
            roomsList.innerHTML = '<div class="text-muted text-center py-2">No rooms on this floor</div>';
            return;
        }
        
        roomsList.innerHTML = ''; // Clear existing rooms
        
        roomsSnapshot.forEach(doc => {
            const room = doc.data();
            const roomItem = document.createElement('a');
            roomItem.href = '#';
            roomItem.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            roomItem.innerHTML = `
                <span>Room ${room.number}${room.name ? ` - ${room.name}` : ''}</span>
                <i class="fas fa-chevron-right text-muted"></i>
            `;
            roomItem.onclick = (e) => {
                e.preventDefault();
                showRoomDetails(doc.id);
            };
            roomsList.appendChild(roomItem);
        });
    } catch (error) {
        console.error('Error loading rooms for floor:', error);
        showToast('Error loading rooms. Please try again.', 'error');
    }
}

// Function to update dashboard statistics
async function updateDashboardStats() {
    try {
        // Get all the stat elements first
        const statElements = {
            totalRooms: document.getElementById('totalRooms'),
            totalEquipment: document.getElementById('totalEquipment'),
            totalMaintenance: document.getElementById('totalMaintenance'),
            totalReplacements: document.getElementById('totalReplacements'),
            floorSummaries: document.getElementById('floorSummaries')
        };

        // Check if we're on the dashboard page
        if (!statElements.floorSummaries) {
            // We're not on the dashboard page, skip the update
            return;
        }

        // Show loading state
        if (statElements.floorSummaries) {
            statElements.floorSummaries.innerHTML = `
                <div class="text-center p-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            `;
        }

        const roomsSnapshot = await getDocs(collection(db, 'rooms'));
        let totalRooms = 0;
        let totalEquipment = 0;
        let needMaintenance = 0;
        let needReplacement = 0;
        const floorStats = new Map(); // Store statistics for each floor

        // Process each room
        for (const roomDoc of roomsSnapshot.docs) {
            const roomData = roomDoc.data();
            const currentFloor = roomData.floor;
            totalRooms++;

            // Initialize floor stats if not exists
            if (!floorStats.has(currentFloor)) {
                floorStats.set(currentFloor, {
                    totalRooms: 0,
                    totalEquipment: 0,
                    needMaintenance: 0,
                    needReplacement: 0,
                    rooms: []
                });
            }
            const floorStat = floorStats.get(currentFloor);
            floorStat.totalRooms++;

            // Get equipment only for this specific room
            const equipmentSnapshot = await getDocs(collection(db, `rooms/${roomDoc.id}/equipment`));
            let roomEquipment = 0;
            equipmentSnapshot.forEach(equipDoc => {
                const equipData = equipDoc.data();
                if (equipData.roomId === roomDoc.id) { // Only count if it belongs to this room
                    roomEquipment += equipData.quantity || 0;
                }
            });
            floorStat.totalEquipment += roomEquipment;
            totalEquipment += roomEquipment;

            // Count maintenance records from the room document
            const roomMaintenance = roomData.maintenance?.filter(m => !m.resolved)?.length || 0;
            needMaintenance += roomMaintenance;
            floorStat.needMaintenance += roomMaintenance;

            // Count replacement records from the room document
            const roomReplacement = roomData.replacements?.filter(r => !r.resolved)?.length || 0;
            needReplacement += roomReplacement;
            floorStat.needReplacement += roomReplacement;

            // Store room details
            floorStat.rooms.push({
                id: roomDoc.id,
                name: roomData.name,
                equipment: roomEquipment,
                maintenance: roomMaintenance,
                replacement: roomReplacement
            });
        }

        // Update overall statistics if elements exist
        if (statElements.totalRooms) statElements.totalRooms.textContent = totalRooms;
        if (statElements.totalEquipment) statElements.totalEquipment.textContent = totalEquipment;
        if (statElements.totalMaintenance) statElements.totalMaintenance.textContent = needMaintenance;
        if (statElements.totalReplacements) statElements.totalReplacements.textContent = needReplacement;

        // Update floor summaries
        if (statElements.floorSummaries) {
            statElements.floorSummaries.innerHTML = ''; // Clear existing content

            // Sort floors numerically
            const sortedFloors = Array.from(floorStats.keys()).sort((a, b) => parseInt(a) - parseInt(b));

            if (sortedFloors.length === 0) {
                statElements.floorSummaries.innerHTML = `
                    <div class="text-center p-4">
                        <div class="text-muted">
                            <i class="fas fa-info-circle me-2"></i>
                            No floors found
                        </div>
                    </div>
                `;
                return;
            }

            // Create floor summaries
            sortedFloors.forEach((floor, index) => {
                const stats = floorStats.get(floor);
                const floorElement = document.createElement('div');
                floorElement.className = 'accordion-item';
                floorElement.innerHTML = `
                    <h2 class="accordion-header">
                        <button class="accordion-button collapsed rounded" type="button" data-bs-toggle="collapse" data-bs-target="#floor${floor}">
                            <div class="d-flex align-items-center justify-content-between w-100 me-3">
                                <span>Floor ${floor}</span>
                                <div class="badge-group">
                                    <span class="badge bg-primary rounded-pill me-2">
                                        <i class="fas fa-door-open me-1"></i>${stats.totalRooms} Rooms
                                    </span>
                                    <span class="badge bg-success rounded-pill me-2">
                                        <i class="fas fa-tools me-1"></i>${stats.totalEquipment} Equipment
                                    </span>
                                    <span class="badge bg-warning rounded-pill me-2">
                                        <i class="fas fa-wrench me-1"></i>${stats.needMaintenance} Maintenance
                                    </span>
                                    <span class="badge bg-danger rounded-pill">
                                        <i class="fas fa-exclamation-triangle me-1"></i>${stats.needReplacement} Replacement
                                    </span>
                                </div>
                            </div>
                        </button>
                    </h2>
                    <div id="floor${floor}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" data-bs-parent="#floorSummaries">
                        <div class="accordion-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0">
                                    <thead class="bg-light">
                                        <tr>
                                            <th class="border-0">Room</th>
                                            <th class="border-0 text-center">Equipment</th>
                                            <th class="border-0 text-center">Need Maintenance</th>
                                            <th class="border-0 text-center">Need Replacement</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${stats.rooms.map(room => `
                                            <tr>
                                                <td class="align-middle">${room.name}</td>
                                                <td class="text-center align-middle">
                                                    <span class="badge bg-success rounded-pill">${room.equipment}</span>
                                                </td>
                                                <td class="text-center align-middle">
                                                    <span class="badge bg-warning rounded-pill">${room.maintenance}</span>
                                                </td>
                                                <td class="text-center align-middle">
                                                    <span class="badge bg-danger rounded-pill">${room.replacement}</span>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;
                statElements.floorSummaries.appendChild(floorElement);
            });
        }

    } catch (error) {
        console.error('Error updating dashboard stats:', error);
        const floorSummaries = document.getElementById('floorSummaries');
        if (floorSummaries) {
            floorSummaries.innerHTML = `
                <div class="text-center p-4">
                    <div class="text-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Error loading dashboard statistics
                    </div>
                </div>
            `;
        }
    }
}

// Add event listeners when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Activity log button click handler
    document.getElementById('activityLogBtn').addEventListener('click', showActivityLog);
    
    // Back to dashboard button click handler
    document.getElementById('backToDashboard')?.addEventListener('click', backToDashboard);
    
    // Refresh activity log button click handler
    document.getElementById('refreshActivityLog')?.addEventListener('click', loadActivityLogs);
    document.getElementById('refreshActivityLog')?.addEventListener('click', loadSavedRooms);   

    // Initialize buttons
    const manageRoomsBtn = document.getElementById('manageRoomsBtn');
    const manageFloorsBtn = document.getElementById('manageFloorsBtn');
    const deleteRoomBtn = document.getElementById('deleteRoomBtn');
    const activityLogBtn = document.getElementById('activityLogBtn');
    
    if (manageRoomsBtn) {
        manageRoomsBtn.addEventListener('click', showRoomManagementModal);
    }
    
    if (manageFloorsBtn) {
        manageFloorsBtn.addEventListener('click', showFloorManagementModal);
    }

    if (deleteRoomBtn) {
        deleteRoomBtn.addEventListener('click', deleteRoom);
    }

    // Add floor form submit handler
    document.getElementById('addFloorForm')?.addEventListener('submit', addFloor);

    // Initialize other components
    loadSavedRooms();
    updateFloorsList();
    updateAllFloors();

    // Refresh dashboard button click handler
    document.getElementById('refreshDashboard')?.addEventListener('click', updateDashboardStats);

    // Initial load of dashboard stats
    updateDashboardStats();

    // Update the logout functionality
    document.querySelector('.logoutBTN')?.addEventListener('click', (e) => {
        e.preventDefault();
        showConfirmation(
            'Are you sure you want to log out?',
            async () => {
                try {
                    await signOut(auth);
                    showToast('Successfully logged out!', 'success');
                    setTimeout(() => window.location.href = 'index.html', 1500);
                } catch (error) {
                    showToast('Error logging out: ' + error.message, 'error');
                }
            },
            'Logout Confirmation'
        );
    });
});

// Add floor function
async function addFloor(e) {
    e.preventDefault();
    
    try {
        const floorNumber = document.getElementById('floorNumber').value;
        const floorName = document.getElementById('floorName').value;

        // Create floor document with floor number as ID
        const floorId = floorNumber.toString();
        await setDoc(doc(db, 'floors', floorId), {
            number: parseInt(floorNumber),
            name: floorName,
            createdAt: serverTimestamp()
        });

        // Log the activity
        await logActivity('add_floor', `Added floor ${floorNumber}${floorName ? ` - ${floorName}` : ''}`);

        // Clear the form
        document.getElementById('addFloorForm').reset();

        // Refresh the floors list
        await updateFloorsList();
        await updateAllFloors();

        showToast('Floor added successfully!', 'success');
    } catch (error) {
        console.error('Error adding floor:', error);
        showToast('Error adding floor. Please try again.', 'error');
    }
}

// Remove floor function
async function removeFloor(floorId, floorNumber) {
    try {
        // Check if there are any rooms on this floor
        const roomsQuery = query(collection(db, 'rooms'), where('floor', '==', floorNumber.toString()));
        const roomsSnapshot = await getDocs(roomsQuery);
        
        if (!roomsSnapshot.empty) {
            showToast('Cannot delete floor that has rooms. Please delete all rooms first.', 'error');
            return;
        }

        // Show confirmation dialog
        showConfirmation(
            `Are you sure you want to delete Floor ${floorNumber}? This action cannot be undone.`,
            async () => {
                try {
                    // Delete the floor document
                    await deleteDoc(doc(db, 'floors', floorId));

                    // Log the activity
                    await logActivity('delete_floor', `Deleted floor ${floorNumber}`);

                    // Close the floor management modal if it's open
                    const modalElement = document.getElementById('floorManagementModal');
                    if (modalElement) {
                        const modal = bootstrap.Modal.getInstance(modalElement);
                        if (modal) {
                            modal.hide();
                        }
                    }

                    // Update all UI components
                    await Promise.all([
                        updateAllFloors(),
                        updateFloorsList(),  // Update sidebar accordion and modal list
                        updateFloorSelects(), // Update floor select dropdowns
                        updateDashboardStats(), // Update dashboard statistics
                        refreshPageContent()
                    ]);


                    showToast('Floor deleted successfully', 'success');

                    
                } catch (error) {
                    console.error('Error deleting floor:', error);
                    showToast('Failed to delete floor', 'error');
                }
            },
            'Delete Floor'
        );
    } catch (error) {
        console.error('Error removing floor:', error);
        showToast('Failed to delete floor', 'error');
    }
}

// Get all rooms in a floor
async function getRoomsInFloor(floor) {
    try {
        const snapshot = await getDocs(query(collection(db, 'rooms'), where('floor', '==', floor), orderBy('number')));
        const rooms = [];
        snapshot.forEach(doc => {
            rooms.push({
                id: doc.id,
                ...doc.data()
            });
        });
        return rooms;
    } catch (error) {
        console.error('Error getting rooms:', error);
        showToast('Error getting rooms. Please try again.', 'error');
        return [];
    }
}

// Update rooms display for a specific floor
function updateFloor(floor, roomsData = {}) {
    const floorBody = document.querySelector(`#floor${floor}FloorCollapse .accordion-body`);
    if (!floorBody) return;

    // Initialize an empty array if no rooms exist for this floor
    const floorRooms = roomsData[floor] || [];
    
    // If there are no rooms, show a message
    if (floorRooms.length === 0) {
        floorBody.innerHTML = '<div class="text-muted p-2">No rooms added yet</div>';
        return;
    }

    floorBody.innerHTML = floorRooms
        .sort((a, b) => a.number.localeCompare(b.number))
        .map(room => {
            return `
                <div class="room-item bg-light d-flex justify-content-between align-items-center p-2 mt-2">
                    <a href="#" class="room-link" onclick="showRoomDetails('${room.id}')">${room.number}</a>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteRoom('${room.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        })
        .join('');
}

// Update all floors
async function updateAllFloors(roomsData = {}) {
    try {
        // Get all rooms
        const snapshot = await getDocs(collection(db, 'rooms'));
        snapshot.forEach((doc) => {
            const room = doc.data();
            const floor = room.floor;
            if (!roomsData[floor]) {
                roomsData[floor] = [];
            }
            roomsData[floor].push({
                id: doc.id,
                ...room
            });
        });

        // Update each floor's display
        for (let floor = 1; floor <= 6; floor++) {
            updateFloor(floor, roomsData);
        }
    } catch (error) {
        console.error('Error updating floors:', error);
        showToast('Error updating floor display. Please try again.', 'error');
    }
}

// Make functions globally available
window.showAddEquipmentModal = showAddEquipmentModal;
window.addNeedsMaintenance = addNeedsMaintenance;
window.addNeedsReplacement = addNeedsReplacement;
window.confirmDeleteRoom = confirmDeleteRoom;
window.deleteRoom = deleteRoom;
window.showRoomDetails = showRoomDetails;
window.loadSavedRooms = loadSavedRooms;
window.updateFloorsList = updateFloorsList;
window.updateAllFloors = updateAllFloors;
window.backToDashboard = backToDashboard;
window.removeFloor = removeFloor;
window.addEquipment = addEquipment;
window.submitNeedsMaintenance = submitNeedsMaintenance;
window.submitNeedsReplacement = submitNeedsReplacement;
window.deleteEquipment = deleteEquipment;
window.deleteMaintenanceRecord = deleteMaintenanceRecord;
window.deleteReplacementRecord = deleteReplacementRecord;

// Authentication state listener
onAuthStateChanged(auth, (currentUser) => {
    if (currentUser) {
        user = currentUser;
        // Perform any initialization that requires authentication
        updateAllFloors();
    } else {
        // User is signed out
        user = null;
        window.location.href = 'index.html';
    }
});

// Function to show activity log
function showActivityLog() {
    // Hide all sections first
    document.getElementById('defaultDashboard').classList.add('d-none');
    document.getElementById('roomDetailsSection').classList.add('d-none');
    
    // Show activity log section
    const activityLogSection = document.getElementById('activityLogSection');
    activityLogSection.classList.remove('d-none');
    
    // Load activity logs
    loadActivityLogs();
}

// Function to go back to dashboard
function backToDashboard() {
    // Hide activity log section and show default dashboard
    document.getElementById('activityLogSection').classList.add('d-none');
    document.getElementById('defaultDashboard').classList.remove('d-none');
    document.getElementById('roomDetailsSection').classList.add('d-none');
}

// Add needs maintenance record
async function addNeedsMaintenance(roomId) {
    try {
        const modalHtml = `
            <div class="modal fade" id="needsMaintenanceModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Equipment Needs Maintenance</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="needsMaintenanceForm">
                                <div class="mb-3">
                                    <label class="form-label">Equipment Name</label>
                                    <input type="text" class="form-control" id="maintenanceEquipmentName" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Quantity</label>
                                    <input type="number" class="form-control" id="maintenanceQuantity" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Status</label>
                                    <select class="form-select" id="maintenanceStatus" required>
                                        <option value="Needs Repair">Needs Repair</option>
                                        <option value="Not Working">Not Working</option>
                                        <option value="Damaged">Damaged</option>
                                        <option value="Regular Maintenance">Regular Maintenance</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea class="form-control" id="maintenanceDescription" rows="3" required></textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="submitNeedsMaintenance('${roomId}')">Submit</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to body if it doesn't exist
        if (!document.getElementById('needsMaintenanceModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('needsMaintenanceModal'));
        modal.show();
    } catch (error) {
        console.error('Error showing needs maintenance modal:', error);
        showToast('Error', 'Failed to show maintenance modal');
    }
}

// Submit needs maintenance record
async function submitNeedsMaintenance(roomId) {
    try {
        // First get the current room data
        const roomRef = doc(db, 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);
        
        if (!roomDoc.exists()) {
            throw new Error('Room not found');
        }

        const maintenanceData = {
            equipmentName: document.getElementById('maintenanceEquipmentName').value,
            quantity: document.getElementById('maintenanceQuantity').value,
            status: document.getElementById('maintenanceStatus').value,
            description: document.getElementById('maintenanceDescription').value,
            createdAt: Timestamp.now(),
            resolved: false,
            equipmentId: document.getElementById('maintenanceEquipmentName').dataset.equipmentId || null
        };

        // Get current maintenance array or initialize it
        const currentData = roomDoc.data();
        const maintenance = currentData.maintenance || [];
        
        // Add new maintenance data to the array
        maintenance.push(maintenanceData);
        
        // Update the room document with the new maintenance array
        await updateDoc(roomRef, {
            maintenance: maintenance
        });
        
        // Log the activity
        await logActivity('Added Maintenance Need', {
            type: 'maintenance',
            details: `Added maintenance need for ${maintenanceData.equipmentName} in room ${roomId}`,
            references: {
                roomId: roomId,
                quantity: maintenanceData.quantity,
                equipmentName: maintenanceData.equipmentName,
                status: maintenanceData.status,
                reason: maintenanceData.description
            }
        });
        
        // Close modal and clear form
        const modal = bootstrap.Modal.getInstance(document.getElementById('needsMaintenanceModal'));
        modal.hide();
        document.getElementById('needsMaintenanceForm').reset();
        
        // Refresh maintenance list
        await loadMaintenanceForRoom(roomId);
        
        // Update dashboard stats
        updateDashboardStats();
        
        showToast('Success', 'Maintenance need recorded successfully');
    } catch (error) {
        console.error('Error adding maintenance need:', error);
        showToast('Error', 'Failed to record maintenance need');
    }
}

// Add needs replacement record
async function addNeedsReplacement(roomId) {
    try {
        const modalHtml = `
            <div class="modal fade" id="needsReplacementModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Equipment Needs Replacement</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="needsReplacementForm">
                                <div class="mb-3">
                                    <label class="form-label">Equipment Name</label>
                                    <input type="text" class="form-control" id="replacementEquipmentName" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Quantity</label>
                                    <input type="number" class="form-control" id="replacementQuantity" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Status</label>
                                    <select class="form-select" id="replacementStatus" required>
                                        <option value="Beyond Repair">Beyond Repair</option>
                                        <option value="Obsolete">Obsolete</option>
                                        <option value="End of Life">End of Life</option>
                                        <option value="Missing">Missing</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea class="form-control" id="replacementDescription" rows="3" required></textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="submitNeedsReplacement('${roomId}')">Submit</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to body if it doesn't exist
        if (!document.getElementById('needsReplacementModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('needsReplacementModal'));
        modal.show();
    } catch (error) {
        console.error('Error showing needs replacement modal:', error);
        showToast('Error', 'Failed to show replacement modal');
    }
}

// Resolve maintenance record
async function resolveMaintenanceRecord(roomId, recordIndex) {
    showConfirmation(
        'Are you sure you want to mark this maintenance record as resolved?',
        async () => {
            try {
                const roomRef = doc(db, 'rooms', roomId);
                const roomDoc = await getDoc(roomRef);
                if (!roomDoc.exists()) {
                    showToast('Error', 'Room not found');
                    return;
                }
                const roomData = roomDoc.data();
                const maintenance = roomData.maintenance || [];

                if (recordIndex >= maintenance.length) {
                    showToast('Error', 'Invalid maintenance record index');
                    return;
                }

                // Update the record's resolved status
                maintenance[recordIndex].resolved = true;
                maintenance[recordIndex].resolvedAt = Timestamp.now();

                // Update the room document
                await updateDoc(roomRef, {
                    maintenance: maintenance
                });

                // Log activity
                await logActivity('resolve', `Resolved maintenance record in room ${roomId}`);

                // Refresh maintenance list
                loadMaintenanceForRoom(roomId);

                showToast('Success', 'Maintenance record marked as resolved');
            } catch (error) {
                console.error('Error resolving maintenance record:', error);
                showToast('Error', 'Failed to resolve maintenance record');
            }
        },
        'Resolve Maintenance Record'
    );
}

// Resolve replacement record
async function resolveReplacementRecord(roomId, recordIndex) {
    showConfirmation(
        'Are you sure you want to mark this replacement record as resolved?',
        async () => {
            try {
                const roomRef = doc(db, 'rooms', roomId);
                const roomDoc = await getDoc(roomRef);
                if (!roomDoc.exists()) {
                    showToast('Error', 'Room not found');
                    return;
                }
                const roomData = roomDoc.data();
                const replacements = roomData.replacements || [];

                if (recordIndex >= replacements.length) {
                    showToast('Error', 'Invalid replacement record index');
                    return;
                }

                // Update the record's resolved status
                replacements[recordIndex].resolved = true;
                replacements[recordIndex].resolvedAt = Timestamp.now();

                // Update the room document
                await updateDoc(roomRef, {
                    replacements: replacements
                });

                // Log activity
                await logActivity('resolve', `Resolved replacement record in room ${roomId}`);

                // Refresh replacement list
                loadReplacementsForRoom(roomId);

                showToast('Success', 'Replacement record marked as resolved');
            } catch (error) {
                console.error('Error resolving replacement record:', error);
                showToast('Error', 'Failed to resolve replacement record');
            }
        },
        'Resolve Replacement Record'
    );
}

// Make resolve functions globally available
window.resolveMaintenanceRecord = resolveMaintenanceRecord;
window.resolveReplacementRecord = resolveReplacementRecord;

// Load equipment for a room
async function loadEquipmentForRoom(roomId) {
    try {
        const equipmentList = document.getElementById('equipmentList');
        if (!equipmentList) {
            console.error('Equipment list element not found');
            return;
        }

        const equipmentRef = collection(db, `rooms/${roomId}/equipment`);
        const equipmentSnapshot = await getDocs(equipmentRef);

        if (equipmentSnapshot.empty) {
            equipmentList.innerHTML = '<div class="text-center text-muted py-3">No equipment added yet</div>';
            return;
        }

        let equipmentHtml = '';
        equipmentSnapshot.forEach(doc => {
            const equipment = doc.data();
            equipmentHtml += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${equipment.name}</h6>
                            <span class="badge bg-info">${equipment.status}</span>
                            <p class="text-muted small mb-1">Quantity: ${equipment.quantity}</p>
                            <small class="text-muted">Added: ${formatTimestamp(equipment.addedAt)}</small>
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteEquipment('${doc.id}', '${roomId}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        equipmentList.innerHTML = equipmentHtml;
    } catch (error) {
        console.error('Error loading equipment:', error);
        equipmentList.innerHTML = '<div class="text-center text-danger py-3">Error loading equipment</div>';
    }
}

// Delete equipment
async function deleteEquipment(equipmentId, roomId) {
    try {
        // Show confirmation dialog
        showConfirmation(
            'Are you sure you want to delete this equipment?',
            async () => {
                try {
                    // Delete the equipment document
                    await deleteDoc(doc(db, `rooms/${roomId}/equipment`, equipmentId));

                    // Log activity
                    await logActivity('delete_equipment', `Deleted equipment ${equipmentId} from Room ${roomId}`);

                    // Update both room details and dashboard stats
                    await Promise.all([
                        loadEquipmentForRoom(roomId), // Refresh equipment list in room details
                        updateDashboardStats(),       // Update dashboard statistics
                        loadSavedRooms()             // Refresh room list to show updated equipment count
                    ]);

                    showToast('Equipment deleted successfully', 'success');
                } catch (error) {
                    console.error('Error deleting equipment:', error);
                    showToast('Failed to delete equipment', 'error');
                }
            },
            'Delete Equipment'
        );
    } catch (error) {
        console.error('Error preparing to delete equipment:', error);
        showToast('Error preparing to delete equipment', 'error');
    }
}

// Load maintenance records for a room
async function loadMaintenanceForRoom(roomId) {
    try {
        const maintenanceList = document.getElementById('maintenanceList');
        if (!maintenanceList) return;
        
        const roomRef = doc(db, 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);
        if (!roomDoc.exists()) {
            maintenanceList.innerHTML = '<div class="text-muted text-center py-3">No maintenance needs reported</div>';
            return;
        }
        const roomData = roomDoc.data();
        const maintenance = roomData.maintenance || [];

        if (maintenance.length === 0) {
            maintenanceList.innerHTML = '<div class="text-muted text-center py-3">No maintenance needs reported</div>';
            return;
        }

        let maintenanceHtml = '';
        maintenance.forEach((record, index) => {
            const statusBadge = record.resolved ? 
                `<span class="badge bg-success">Resolved</span>` : 
                `<span class="badge bg-warning">${record.status}</span>`;
            const resolveButton = !record.resolved ? 
                `<button type="button" class="btn btn-sm btn-outline-success" onclick="resolveMaintenanceRecord('${roomId}', ${index})">
                    <i class="fas fa-check"></i>
                </button>` : '';
            maintenanceHtml += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${record.equipmentName}</h6>
                            ${statusBadge}
                            <p class="text-muted small mb-1">Quantity: ${record.quantity}</p>
                            <p class="text-muted small mb-1">${record.description}</p>
                            <small class="text-muted">Reported: ${formatTimestamp(record.createdAt)}</small>
                            ${record.resolved ? `<br><small class="text-muted">Resolved: ${formatTimestamp(record.resolvedAt)}</small>` : ''}
                        </div>
                        <div class="btn-group">
                            ${resolveButton}
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteMaintenanceRecord('${roomId}', ${index})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        maintenanceList.innerHTML = maintenanceHtml;
    } catch (error) {
        console.error('Error loading maintenance needs:', error);
        maintenanceList.innerHTML = '<div class="text-center text-danger py-3">Error loading maintenance needs</div>';
    }
}

// Delete maintenance record
async function deleteMaintenanceRecord(roomId, recordIndex) {
    showConfirmation(
        'Are you sure you want to delete this maintenance record?',
        async () => {
            try {
                const roomRef = doc(db, 'rooms', roomId);
                const roomDoc = await getDoc(roomRef);
                if (!roomDoc.exists()) {
                    showToast('Error', 'Room not found');
                    return;
                }
                const roomData = roomDoc.data();
                const maintenance = roomData.maintenance || [];

                if (recordIndex >= maintenance.length) {
                    showToast('Error', 'Invalid maintenance record index');
                    return;
                }

                // Remove the record from the maintenance array
                maintenance.splice(recordIndex, 1);

                // Update the room document
                await updateDoc(roomRef, {
                    maintenance: maintenance
                });

                // Log activity
                await logActivity('delete', `Deleted maintenance record from room ${roomId}`);

                // Refresh maintenance list
                loadMaintenanceForRoom(roomId);

                showToast('Success', 'Maintenance record deleted successfully');
            } catch (error) {
                console.error('Error deleting maintenance record:', error);
                showToast('Error', 'Failed to delete maintenance record');
            }
        },
        'Delete Maintenance Record'
    );
}

// Load replacements records for a room
async function loadReplacementsForRoom(roomId) {
    try {
        const replacementList = document.getElementById('replacementList');
        if (!replacementList) return;

        const roomRef = doc(db, 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);
        if (!roomDoc.exists()) {
            replacementList.innerHTML = '<div class="text-muted text-center py-3">No replacement records found</div>';
            return;
        }
        const roomData = roomDoc.data();
        const replacements = roomData.replacements || [];

        if (replacements.length === 0) {
            replacementList.innerHTML = '<div class="text-muted text-center py-3">No replacement records found</div>';
            return;
        }

        let replacementsHtml = '';
        replacements.forEach((record, index) => {
            const statusBadge = record.resolved ? 
                `<span class="badge bg-success">Resolved</span>` : 
                `<span class="badge bg-danger">${record.status}</span>`;
            const resolveButton = !record.resolved ? 
                `<button type="button" class="btn btn-sm btn-outline-success" onclick="resolveReplacementRecord('${roomId}', ${index})">
                    <i class="fas fa-check"></i>
                </button>` : '';
            replacementsHtml += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${record.equipmentName}</h6>
                            ${statusBadge}
                            <p class="text-muted small mb-1">Quantity: ${record.quantity}</p>
                            <p class="text-muted small mb-1">${record.description}</p>
                            <small class="text-muted">Reported: ${formatTimestamp(record.createdAt)}</small>
                            ${record.resolved ? `<br><small class="text-muted">Resolved: ${formatTimestamp(record.resolvedAt)}</small>` : ''}
                        </div>
                        <div class="btn-group">
                            ${resolveButton}
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteReplacementRecord('${roomId}', ${index})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        replacementList.innerHTML = replacementsHtml;
    } catch (error) {
        console.error('Error loading replacement records:', error);
    }
}

// Delete replacement record
async function deleteReplacementRecord(roomId, recordIndex) {
    showConfirmation(
        'Are you sure you want to delete this replacement record?',
        async () => {
            try {
                const roomRef = doc(db, 'rooms', roomId);
                const roomDoc = await getDoc(roomRef);
                if (!roomDoc.exists()) {
                    showToast('Error', 'Room not found');
                    return;
                }
                const roomData = roomDoc.data();
                const replacements = roomData.replacements || [];

                if (recordIndex >= replacements.length) {
                    showToast('Error', 'Invalid replacement record index');
                    return;
                }

                // Remove the record from the replacements array
                replacements.splice(recordIndex, 1);

                // Update the room document
                await updateDoc(roomRef, {
                    replacements: replacements
                });

                // Log activity
                await logActivity('delete', `Deleted replacement record from room ${roomId}`);

                // Refresh replacement list
                loadReplacementsForRoom(roomId);

                showToast('Success', 'Replacement record deleted successfully');
            } catch (error) {
                console.error('Error deleting replacement record:', error);
                showToast('Error', 'Failed to delete replacement record');
            }
        },
        'Delete Replacement Record'
    );
}

// Function to confirm and delete room
async function confirmDeleteRoom(roomId) {
    const roomDoc = await getDoc(doc(db, 'rooms', roomId));
    if (!roomDoc.exists()) {
        showToast('Room not found.', 'error');
        return;
    }
    const roomData = roomDoc.data();

    showConfirmation(
        `Are you sure you want to delete Room ${roomData.number}? This will permanently delete all equipment and records associated with this room.`,
        async () => {
            try {
                await deleteRoom(roomId);
                backToDashboard();
            } catch (error) {
                console.error('Error deleting room:', error);
                showToast('Error deleting room. Please try again.', 'error');
            }
        },
        'Delete Room'
    );
}

// Function to load room details
async function loadRoomDetails(roomId) {
    try {
        const roomRef = doc(db, 'rooms', roomId);
        
        // Get existing room data first
        const roomDoc = await getDoc(roomRef);
        if (!roomDoc.exists()) {
            showToast('Room not found.', 'error');
            const modal = bootstrap.Modal.getInstance(document.getElementById('roomDetailsModal'));
            if (modal) {
                modal.hide();
            }
            return;
        }

        currentRoomId = roomId;
        const roomData = roomDoc.data();

        // Update room details in the modal
        document.getElementById('roomDetailsTitle').textContent = `Room ${roomData.number}`;
        document.getElementById('roomDetailsName').textContent = roomData.name;
        document.getElementById('roomDetailsNumber').textContent = roomData.number;
        document.getElementById('roomDetailsFloor').textContent = roomData.floor;
        document.getElementById('roomDetailsBuilding').textContent = roomData.building;

        // Load equipment, maintenance, and replacements
        await Promise.all([
            loadEquipmentForRoom(roomId),
            loadMaintenanceForRoom(roomId),
            loadReplacementsForRoom(roomId)
        ]);

    } catch (error) {
        console.error('Error loading room details:', error);
        showToast('Error loading room details. Please try again.', 'error');
    }
}

// Function to load saved rooms
async function loadSavedRooms() {
    try {
        const roomsContainer = document.getElementById('roomsContainer');
        if (!roomsContainer) return;

        roomsContainer.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';

        const querySnapshot = await getDocs(collection(db, 'rooms'));
        
        if (querySnapshot.empty) {
            roomsContainer.innerHTML = '<div class="text-center text-muted">No rooms found</div>';
            return;
        }

        const roomsHtml = [];
        querySnapshot.forEach((doc) => {
            const room = doc.data();
            roomsHtml.push(`
                <div class="col-md-4 mb-3">
                    <div class="card h-100">
                        <div class="card-body">
                            <h5 class="card-title">${room.name}</h5>
                            <h6 class="card-subtitle mb-2 text-muted">Room ${room.number}</h6>
                            <p class="card-text">
                                <small class="text-muted">
                                    <i class="fas fa-building me-1"></i>${room.building}<br>
                                    <i class="fas fa-layer-group me-1"></i>Floor ${room.floor}
                                </small>
                            </p>
                            <button class="btn btn-primary btn-sm" onclick="openRoomDetails('${doc.id}')">
                                <i class="fas fa-info-circle me-1"></i>Details
                            </button>
                        </div>
                    </div>
                </div>
            `);
        });

        roomsContainer.innerHTML = roomsHtml.join('');

    } catch (error) {
        console.error('Error loading rooms:', error);
        roomsContainer.innerHTML = '<div class="text-center text-danger">Error loading rooms</div>';
    }
}


// Make refresh function globally available
