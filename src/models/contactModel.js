import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  full_name: { type: String, required: true, maxlength: 255 },
  preferred_location_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  budget_min: { type: mongoose.Schema.Types.Decimal128 },
  budget_max: { type: mongoose.Schema.Types.Decimal128 },
  property_types: { type: String },
  desired_area_min: { type: Number },
  desired_area_max: { type: Number },
  rooms_min: { type: Number },
  rooms_max: { type: Number },
  amenities: { type: mongoose.Schema.Types.Mixed }, // comfort things parking , pool ,gym,elevator
  priority_level: { type: String, enum: ['Low', 'Medium', 'High'] },
  preferred_contact_method: { type: String, enum: ['Phone', 'Email'] }
}, {
  timestamps: true
});

export default mongoose.model('Contact', contactSchema);  