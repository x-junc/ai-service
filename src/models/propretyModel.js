import mongoose from 'mongoose';

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 255 },
  location_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  price: { type: mongoose.Schema.Types.Decimal128, required: true },
  area: { type: Number },
  property_type: { type: String },
  rooms: { type: Number },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  availability_status: { type: String, enum: ['Available', 'Sold', 'Rented'] },
  amenities: { type: mongoose.Schema.Types.Mixed }, // comfort things

  //parking , pool ,gym,elevator



  condition: { type: String }
}, {
  timestamps: true
});

export default mongoose.model('Property', propertySchema);