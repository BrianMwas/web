import { ADD_PROJECT, ADD_PROJECT_REQUEST, ADD_PROJECT_FAILURE, 
	ADD_DRAFT_PROJECT, ADD_DRAFT_PROJECT_REQUEST, 
	ADD_DRAFT_PROJECT_FAILURE, GET_ALLDRAFTS, GET_ALLDRAFTS_FAIL, GET_ALLDRAFTS_REQUEST, GET_ALLPROJECTS, GET_ALLPROJECTSFAIL, GET_ALLPROJECTS_REQUEST } from "../MutationTypes";
import { projectsCollection, draftsCollection, Timestamp, storageRef, TaskEvent, TaskState, notifications } from "../../db";
import { SnackbarProgrammatic as Snackbar, NotificationProgrammatic as Notification } from 'buefy'
import router from "../../router";
// Generates a random key used to identify draft projects before submitting to the database.

const tempId = length => {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

const convertToDate = s => {
	let date = new Date();
	date.setSeconds(s);

	return date;
}

const uploadFiles =  (file, dir) => {
	let progress, status;
	return new Promise((resolve, reject) => {
		let uploadTask = storageRef.child(`${dir}/${file.name}`).put(file, { contentType: file.type })

		uploadTask.on(TaskEvent.STATE_CHANGED, (snapshot) => {
			progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
			// //('Upload is ' + progress + '% done');
			switch (snapshot.state) {
				case TaskState.PAUSED: // or 'paused'
				// //('Upload is paused');
				status = 'paused'
				break;
				case TaskState.RUNNING: // or 'running'
				// //('Upload is running');
				status = 'running'
				break;
				case TaskState.SUCCESS:
				// status = "complete";
				break;
			}
		}, (error) => {
			switch(error.code) {
				case 'storage/unauthorized':
				// User doesn't have permission to access the object
				// //("You dont have permmission")
				error = 'unauthorized';
				reject(new Error('No permission'))
				break;

				case 'storage/canceled':
				// User canceled the upload
				// //("error cancelled")
				error = 'cancelled'
				reject(new Error("Process cancelled"))
				break;

				case 'storage/unknown':
				// Unknown error occurred, inspect error.serverResponse
				error = 'Error occurred'
				reject(new Error('Error occured. Unknown'))
				// //("error unknown")

				break;
			}
		}, () => {
			uploadTask.snapshot.ref.getDownloadURL()
			.then(url => {
				// //("url", url)
				resolve(url)
				// //("files", filesUrl)
			})
			console.log("status", { status, progress })
			// //("status", status);
		})
	})
}

const projects = {
    namespaced: true,
    state: {
		gettingAllProj: false,
		gettingAllProjFail: false,
		gettingAllDrafts: false,
		gettingAllDraftsFail: false,
		creatingProject: false,
		addingProjectFail: false,
		updatingProject: false,
		updatingProjectFail: false,
		projects: [],
		addingDraftProject: false,
		addingDraftFail: false,
		draftProjects: [],
		pFileProgess: 0,
		uploadingFiles : false
    },
    mutations: {
		[ADD_PROJECT_REQUEST] (state) {
			state.creating = true;
		},
		[ADD_PROJECT_FAILURE] (state) {
			state.creatingProject = false;
			state.addingDraftFail = true;
		},
		[ADD_DRAFT_PROJECT] (state, data) {
			state.addingDraftProject = false;
			state.addingDraftFail = false;

			if(state.draftProjects.includes(data) === false) {
				state.draftProjects.push({
					draftKey: tempId(5),
					email: data.email,
					pageNumber: data.pageNumber,
					paperType: data.paperType,
					deadline: data.dealine
				})
			}

		},
		[ADD_DRAFT_PROJECT_REQUEST] (state) {
			state.addingDraftFail = false;
			state.addingDraftProject = true
		},
		[ADD_DRAFT_PROJECT_FAILURE] (state) {
			state.addingDraftProject = false;
			state.addingDraftFail = true;
		}, 
		[GET_ALLPROJECTS_REQUEST] (state) {
			state.gettingAllProj = true
		},
		[GET_ALLPROJECTS] (state, payload) {
			state.gettingAllProj = false;
			state.gettingAllProjFail = false;
			if(state.projects.includes(payload) === false) {
				state.projects.unshift(payload)
			}
		},
		[GET_ALLPROJECTSFAIL] (state) {
			state.gettingAllProjFail = true
			state.gettingAllProj = false;
		},
		[GET_ALLDRAFTS_REQUEST] (state) {
			state.gettingAllDrafts = true;
		},
		[GET_ALLDRAFTS] (state, payload) {
			state.gettingAllDrafts = true;
			state.gettingAllDraftsFail = false;
			state.draftProjects = payload;
		},
		[GET_ALLDRAFTS_FAIL] (state) {
			state.gettingAllDraftsFail = true;
		},
		[ADD_PROJECT] (state, payload) {
			state.creatingProject = false;
			state.addingProjectFail = false;
			state.projects.unshift(payload);
		},
		addProjectComplete(state) {
			state.creatingProject = false;
			state.addingProjectFail = false
		},	
		uploading(state) {
			state.uploadingFiles = true
		},
		uploadFiles(state, progress) {
			state.uploadingFiles = false;
			state.uploadingFailed = false;
			state.uploadProgress = progress;
		},
		uploadingFailed(state) {
			state.uploadingFiles= false
		},
		updateProjectRequest(state) {
			state.updatingProject = true
		},
		updateProject(state, payload) {
			if(payload) {
				delete payload.status.PayRef;
				state.updatingProject = false;
				state.updatingProjectFail = false;
				let projIndex = state.projects.findIndex(p => p.id == payload.id);
				state.projects.splice(projIndex, 1, payload)
			}
		},
		updateProjectFail(state) {
			state.updatingProject = false;
			state.updatingProjectFail = true
		}
    },
    actions: {
		initDrafts({ commit }, payload) {
			commit(GET_ALLDRAFTS_REQUEST);
			draftsCollection
			.where('draft', '==', true)
			.where('email', '==', payload)
			.get()
			.then(result => {
				if(result.empty) {
					commit(GET_ALLDRAFTS_FAIL)
					// No drafts found...
					
					// //("No drafts yet");

				} else {
					// //("result", result);
					let drafts = [];
					result.forEach(r => {
						let id = r.id;
						let { createdAt, deadline } = r.data()
						createdAt = convertToDate(createdAt.seconds);
						deadline = convertToDate(deadline.seconds)
						
						let dData = { ...r.data(), id }
						dData.createdAt = createdAt;
						dData.deadline = deadline;
						
						//("r", dData)
						drafts.unshift(dData)
					})
					//("drafts", drafts);
					Snackbar.open({
						
						type: 'is-info',
						duration: 5000,
						position: 'is-bottom-right',
						message: "You have "+ drafts.length + " drafts. Please complete to publish them."
					})
					commit(GET_ALLDRAFTS, drafts);
				}
			})
			.catch(error => {
				//("error all drafts", error)
				Notification.open({
					queue: true,
					message: "Sorry we were unable to fetch the drafts :"+error.message,
					position: 'is-top-right',
					type: 'is-warning'
				})
				commit(GET_ALLDRAFTS_FAIL)
			})
		},
		initProjects({ commit }, payload) {
			commit(GET_ALLPROJECTS_REQUEST);
			//("payload", payload)
			if(payload.userId) {
				projectsCollection
				.where('creator', '==', payload.userId)
				.get()
				.then(res => {
					if(res.empty) {
						Notification.open({
							queue: true,
							message: "You don't have any projects yet. Create one...",
							duration: 10000,
							type: 'is-warning',
							position: 'is-bottom-right'
						})
						commit(GET_ALLPROJECTSFAIL)
					} else {
						res.forEach(p => {
							let id = p.id;
							let deadline = p.data()['deadline'].toDate()
							delete p.data()['deadline']
							
							let pData = p.data()
							pData.id = id;
							pData.deadline = deadline;
							commit(GET_ALLPROJECTS, pData)
						})
					}
				})
				.catch(error => {
					console.log("error", error)
					//("error", error)
					Notification.open({
						message: "Sorry we were unable to fetch the projects :"+error.message,
						position: 'is-top-right',
						queue: false,
						type: 'is-warning'
					})
					commit(GET_ALLPROJECTSFAIL)
				})
			} else {
				commit(GET_ALLPROJECTSFAIL)
			}
		},
		addProject({ commit }, data) {
			commit(ADD_PROJECT_REQUEST);
				// let newProject = projectsCollection.doc()
				if(data.files) {
					Promise.all(
						data.files.map(e => uploadFiles(e, 'files'))
					).then(res => {
						commit(ADD_PROJECT_REQUEST)
						const docId = tempId(6)
						projectsCollection.doc(docId).set({
							pid: docId,
							name: data.name,
							status: 'pending',
							description: data.description || '',
							deadline: data.deadline,
							paperType: data.paperType,
							pages: data.pageNumber,
							files: res,
							price: data.price,
							createdAt: Timestamp.now(),
							creator: data.creator
						})
						.then(result => {
							result.set({
								files: res
							}, { merge: true })
							
							projectsCollection.doc(docId)
							.get()
							.then(newProject => {
								let id = newProject.id;
								let d =  newProject.data();
								let data = { ...d, id };
								console.log("data p", data);
								commit('addProjectComplete')
							})
							.catch(() => {
								Notification.open({
									position: 'is-top-right',
									type: 'is-warning',
									message: "Sorry we coould not set up the payment. You'll have to set it up manually"
								})
							})							
							
						}).catch(error => {
							//("erro", error);
							Notification.open({
								queue: true,
								message: "Sorry we were unable to complete adding the project :"+error.message,
								position: 'is-top-right',
								type: 'is-warning'
							})
							commit(ADD_PROJECT_FAILURE)
						})
					})
					.catch(error => {
						//("error", error)
						Notification.open({
							queue: true,
							message: "Sorry we were unable to complete adding the project :"+error.message,
							position: 'is-top-right',
							type: 'is-warning'
						})
					})
				} else {
					commit(ADD_DRAFT_PROJECT_REQUEST)
					const docId = tempId(6)
					projectsCollection.doc(docId).set({
						pid: docId,
						name: data.name,
						status: 'pending',
						description: data.description || '',
						deadline: data.deadline,
						paperType: data.paperType,
						pages: data.pageNumber,
						files: [],
						price: data.price,
						createdAt: Timestamp.now(),
						creator: data.creator
					})
					.then(()=> {
						projectsCollection.doc(docId)
						.get()
						.then(res => {
							router.push(`/pay/${res.data().price}/${res.id}`)
							commit('addProjectComplete')
						})
						.catch(error => {
							console.log("error", error)
						})
					}).catch(error => {
						//("erro", error);
						Notification.open({
							queue: true,
							message: "Sorry we were unable to complete adding the project :"+error.message,
							position: 'is-top-right',
							type: 'is-warning'
						})
						commit(ADD_PROJECT_FAILURE)
					})
				// }
				}
		},
		addDraftProject({ commit }, data) {
			commit(ADD_DRAFT_PROJECT_REQUEST);
			// pd means projects that don't have all details.
			draftsCollection.add({
				email: data.email,
				pages: data.pages,
				paperType: data.paperType,
				price: data.price,
				deadline: data.deadline,
				draft: true,
				createdAt: Timestamp.now()
			})
			.then(result => {
				//("result", result)
				result.onSnapshot(q => {
					Notification.open({
						queue: true,
						message: "Successfully add project "+q.data().paperType,
						position: 'is-top-right',
						type: 'is-warning'
					})
				}, (error) => {
					Notification.open({
						queue: true,
						message: "Sorry we failed to add the project "+error,
						position: 'is-top-right',
						type: 'is-warning'
					})
				}, () => {
					router.push('/auth/signup')
				})
			})
			.catch(error => {
				//("error draft", error)
				Notification.open({
					queue: true,
					message: "Sorry we were unable to complete adding the project :"+error.message,
					position: 'is-top-right',
					type: 'is-warning'
				})
				commit(ADD_PROJECT_FAILURE)
			})
		},
		updateProjects({ commit }, data) {
			commit('updateProject')
			
			let project = projectsCollection.doc(data.pid)
			
			if(data.paymentUpdate) {
				project
				.get()
				.then(result => {
					if(result.exists) {
						project
						.set({
							status: "began",
							payRef: data.ref,
							paid: true
						}, { merge: true })
						.then(() => {
							project
							.get()
							.then(result => {
								if(result.exists) {
									let id = result.id;
									let data = result.data()
									let res = { ...data, id };
									
									let notId = tempId(4)

									let newNote = notifications.doc(notId)
									let today = new Date()
								
									newNote.set({
										name: "Payment successful",
										date: today,
										read: false,
										type: "Payment",
										description: "Your task" + data.name +  " has been paid successfully. And has been received by the team we will begin working on it immediately."
									})
									
									console.log("res", res)
									commit('updateProject', res)
								
								} else {
									Notification.open({
										queue: true,
										message: "Project not found"
									})
								}
							})
							.catch(error => {
								Notification.open({
									queue: true,
									message: "Something went wrong "+error.message
								})
								commit('updateProjectFail')
							})
						})
						.catch(error => {
							Notification.open({
								type: "is-warning",
								message: "Sorry we were unable to update teh payment. We are reviewing what happenend. "+error.message
							})
						})

						
					} else {
						Notification.open({
							queue: true,
							message: "It seems the project is not set up yet. Redirecting..."
						})
						commit('updateProjectFail')
						router.push('/dashboard/projects');
					}				
				})
				.catch(error => {
					console.log("error", error)
					commit('updateProjectFail')
					Notification.open({
						queue: true,
						message: "We could not update the project :"+error.message
					})
				})
			} else {
				project
				.get()
				.then(result => {
					if(result.exists) {
						project.update({
							description: data.description,
							pages: data.pages,
							deadline: data.deadline
						})
						project
						.get()
						.then(result => {
							if(result.exists) {
								let id = result.id;
								let data = result.data()
								data.id = id;
								commit('updateProject', data)
							} else {
								Notification.open({
									queue: true,
									message: "Project not found"
								})
							}
						})
						.catch(error => {
							Notification.open({
								queue: true,
								message: "Something went wrong "+error.message
							})
							commit('updateProjectFail')
						})
						
					} else {
						Notification.open({
							queue: true,
							message: "It seems the project is not set up yet. Redirecting..."
						})
						commit('updateProjectFail')
						router.push('/dashboard/projects');
					}
				})
				.catch(error => {
					Notification.open({
						queue: true,
						message: "We could not update the project :"+error.message,
						type: 'is-danger'
					})
				})
			}
		}
	},
	getters: {
		projectById: (state) => (id) => { return state.projects.find(p => p.id == id)  },
		completedProjects: state => {
			return state.projects.filter(p => p.status == 'completed')
		},
		viableProjects: state => {
			return state.projects.filter(p => {
				let today = new Date();
				let diffTime = new Date(p.deadline) - today;
				//("difftime ", p.deadline);
				return diffTime > 0
			})
		},
		passedProjects: state => {
			return state.projects.filter(p => {
				let today = new Date();
				let diffTime = new Date(p.deadline) - today;
				return diffTime < 0
			})
		},
		cancelled: state => {
			return state.projects.filter(c => c.status == 'cancelled')
		},
		pending: state => {
			return state.projects.filter(p => p.status == 'pending')
		}
	}
}

export default projects;
export {
	uploadFiles
}
