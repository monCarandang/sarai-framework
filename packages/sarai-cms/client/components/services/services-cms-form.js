Template.ServicesCMSForm.onCreated(() => {
  Meteor.subscribe('services')
  this.serviceID = FlowRouter.current().params._id
})

Template.ServicesCMSForm.onRendered(() => {
  setFormDirty()

<<<<<<< eb1e10f14362061ae257a69b6ba3e990be56d141
  $('#cms-service-col1text-editor').summernote();
  $('#cms-service-col2text-editor').summernote();

  //This is such a hack
  const hiddenCode = $('#hidden-col1text').attr('value')
  $('#cms-service-col1Text-editor').code(hiddenCode)
=======
  $(document).ready(function() {
    $('#summernote').summernote();
  });
>>>>>>> Added summernote
})

Template.ServicesCMSForm.events({
  'click #cms-service-save-button': () => {

  }
})

Template.ServicesCMSForm.helpers({
  save: () => {

  },

  service: () => {
    const service = Services.findOne({_id: this.serviceID})

    return service && service
  }
})

const setFormDirty = () => {

  $('#cms-service-title').addClass('is-dirty')
  $('#cms-service-tagline').addClass('is-dirty')
  $('#cms-service-crops').addClass('is-dirty')
  $('#cms-service-experts').addClass('is-dirty')
  $('#cms-service-ura').addClass('is-dirty')
}


//SERVICES CMS EDIT FORM